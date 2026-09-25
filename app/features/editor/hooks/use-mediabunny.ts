"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Input,
    UrlSource,
    ALL_FORMATS,
    CanvasSink,
    AudioBufferSink,
} from "mediabunny";
import { TimelineLayer, TimelineItem } from "@/app/types";

// Types for Mediabunny media management
export interface MediaSource {
    id: string;
    url: string;
    input: Input | null;
    canvasSink: CanvasSink | null;
    audioBufferSink: AudioBufferSink | null;
    duration: number;
    isLoaded: boolean;
}

export interface ThumbnailData {
    id: string;
    frames: ImageBitmap[];
    isLoading: boolean;
}

export interface PlaybackState {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
}

interface UseMediabunnyOptions {
    layers: TimelineLayer[];
    onTimeUpdate?: (time: number) => void;
}

interface UseMediabunnyReturn {
    // Media sources
    videoSources: Map<string, MediaSource>;
    audioSources: Map<string, MediaSource>;

    // Thumbnail extraction
    extractThumbnails: (
        url: string,
        count: number,
        duration: number,
    ) => Promise<ImageBitmap[]>;
    getThumbnailsForClip: (clipId: string) => ThumbnailData | undefined;

    // Playback control
    play: () => void;
    pause: () => void;
    seek: (time: number) => void;
    isPlaying: boolean;
    currentTime: number;
    totalDuration: number;

    // Frame extraction for preview
    getFrameAtTime: (
        time: number,
    ) => Promise<HTMLCanvasElement | OffscreenCanvas | null>;

    // Audio mixing
    getAudioBufferAtTime: (time: number) => Promise<AudioBuffer | null>;

    // Loading states
    isInitializing: boolean;
    isReady: boolean;
}

// Cache for loaded inputs to avoid re-loading
const MAX_INPUT_CACHE_SIZE = 50;
const MAX_THUMBNAIL_CACHE_SIZE = 100;

const inputCache = new Map<string, Input>();
const thumbnailCache = new Map<string, ImageBitmap[]>();

// Keep track of active hook instances to know when to clear global cache
let activeInstances = 0;

export function useMediabunny({
    layers,
    onTimeUpdate,
}: UseMediabunnyOptions): UseMediabunnyReturn {
    // ... state definitions ...
    const [videoSources, setVideoSources] = useState<Map<string, MediaSource>>(
        new Map(),
    );
    const [audioSources, setAudioSources] = useState<Map<string, MediaSource>>(
        new Map(),
    );
    const [thumbnails] = useState<Map<string, ThumbnailData>>(new Map());
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [isInitializing, setIsInitializing] = useState(true);
    const [isReady, setIsReady] = useState(false);

    const animationFrameRef = useRef<number | null>(null);
    const lastFrameTimeRef = useRef<number>(0);
    const audioContextRef = useRef<AudioContext | null>(null);

    // Track instance count and cleanup
    useEffect(() => {
        activeInstances++;
        return () => {
            activeInstances--;
            if (activeInstances === 0) {
                clearMediabunnyCache();
            }
        };
    }, []);

    // Initialize audio context
    useEffect(() => {
        if (typeof window !== "undefined" && !audioContextRef.current) {
            audioContextRef.current = new AudioContext({
                latencyHint: "playback",
                sampleRate: 48000,
            });
        }

        return () => {
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
        };
    }, []);

    // Load an input source with caching
    const loadInput = useCallback(
        async (url: string): Promise<Input | null> => {
            if (!url) return null;

            // Check cache first
            if (inputCache.has(url)) {
                return inputCache.get(url)!;
            }

            try {
                // Enforce cache size limit
                if (inputCache.size >= MAX_INPUT_CACHE_SIZE) {
                    const oldestKey = inputCache.keys().next().value;
                    if (oldestKey) {
                        const oldestInput = inputCache.get(oldestKey);
                        try {
                            oldestInput?.dispose();
                        } catch (e) {
                            console.warn("Failed to dispose old input:", e);
                        }
                        inputCache.delete(oldestKey);
                    }
                }

                const input = new Input({
                    source: new UrlSource(url),
                    formats: ALL_FORMATS,
                });

                inputCache.set(url, input);
                return input;
            } catch (error) {
                console.error("Failed to load input:", url, error);
                return null;
            }
        },
        [],
    );

    // Extract thumbnails from a video URL
    const extractThumbnails = useCallback(
        async (
            url: string,
            count: number,
            duration: number,
        ): Promise<ImageBitmap[]> => {
            // Check cache first
            const cacheKey = `${url}-${count}-${duration}`;
            if (thumbnailCache.has(cacheKey)) {
                return thumbnailCache.get(cacheKey)!;
            }

            const input = await loadInput(url);
            if (!input) return [];

            try {
                const videoTrack = await input.getPrimaryVideoTrack();
                if (!videoTrack) return [];

                const canvasSink = new CanvasSink(videoTrack);
                const frames: ImageBitmap[] = [];
                const interval = duration / count;

                // Generate timestamps
                const timestamps = Array.from({ length: count }, (_, i) =>
                    Math.min(i * interval, duration - 0.1),
                );

                // Extract frames using optimized pipeline
                for await (const wrapped of canvasSink.canvasesAtTimestamps(
                    timestamps,
                )) {
                    if (wrapped && wrapped.canvas) {
                        try {
                            const bitmap = await createImageBitmap(
                                wrapped.canvas,
                            );
                            frames.push(bitmap);
                        } catch {
                            console.warn("Failed to create bitmap");
                        }
                    }
                }

                // Enforce cache size limit
                if (thumbnailCache.size >= MAX_THUMBNAIL_CACHE_SIZE) {
                    const oldestKey = thumbnailCache.keys().next().value;
                    if (oldestKey) {
                        const oldestFrames = thumbnailCache.get(oldestKey);
                        oldestFrames?.forEach((bitmap) => {
                            try {
                                bitmap.close();
                            } catch (e) {
                                console.warn("Failed to close old bitmap:", e);
                            }
                        });
                        thumbnailCache.delete(oldestKey);
                    }
                }

                thumbnailCache.set(cacheKey, frames);
                return frames;
            } catch (error) {
                console.error("Failed to extract thumbnails:", error);
                return [];
            }
        },
        [loadInput],
    );

    // Get thumbnails for a specific clip
    const getThumbnailsForClip = useCallback(
        (clipId: string): ThumbnailData | undefined => {
            return thumbnails.get(clipId);
        },
        [thumbnails],
    );

    // Get a single frame at a specific timeline time
    const getFrameAtTime = useCallback(
        async (
            time: number,
        ): Promise<HTMLCanvasElement | OffscreenCanvas | null> => {
            const videoLayer = layers.find((l) => l.type === "video");
            if (!videoLayer) return null;

            // Find the clip at this time
            const clip = videoLayer.items.find(
                (item) =>
                    time >= item.startTime &&
                    time < item.startTime + item.duration,
            );
            if (!clip || !clip.content) return null;

            const input = await loadInput(clip.content);
            if (!input) return null;

            try {
                const videoTrack = await input.getPrimaryVideoTrack();
                if (!videoTrack) return null;

                const canvasSink = new CanvasSink(videoTrack);
                const clipTime = time - clip.startTime;
                const wrapped = await canvasSink.getCanvas(clipTime);

                if (wrapped && wrapped.canvas) {
                    return wrapped.canvas;
                }
            } catch (error) {
                console.error("Failed to get frame at time:", error);
            }

            return null;
        },
        [layers, loadInput],
    );

    // Get audio buffer at a specific time
    const getAudioBufferAtTime = useCallback(
        async (time: number): Promise<AudioBuffer | null> => {
            // Find all active audio clips at this time
            const activeClips: { item: TimelineItem; layer: TimelineLayer }[] =
                [];

            layers.forEach((layer) => {
                if (layer.type === "voiceover" || layer.type === "music") {
                    layer.items.forEach((item) => {
                        if (
                            time >= item.startTime &&
                            time < item.startTime + item.duration &&
                            item.content
                        ) {
                            activeClips.push({ item, layer });
                        }
                    });
                }
            });

            if (activeClips.length === 0) return null;

            try {
                // Get audio buffer from first active clip for now
                const { item } = activeClips[0];
                const input = await loadInput(item.content);
                if (!input) return null;

                const audioTrack = await input.getPrimaryAudioTrack();
                if (!audioTrack) return null;

                const sink = new AudioBufferSink(audioTrack);
                const clipTime = time - item.startTime;
                const wrapped = await sink.getBuffer(clipTime);

                return wrapped?.buffer || null;
            } catch (error) {
                console.error("Failed to get audio buffer:", error);
                return null;
            }
        },
        [layers, loadInput],
    );

    // Calculate total duration from video layer
    const totalDuration = useMemo(() => {
        const videoLayer = layers.find((l) => l.type === "video");
        if (videoLayer && videoLayer.items.length > 0) {
            const lastItem = videoLayer.items[videoLayer.items.length - 1];
            return lastItem.startTime + lastItem.duration;
        }
        return 0;
    }, [layers]);

    // Initialize video sources
    useEffect(() => {
        const initSources = async () => {
            setIsInitializing(true);
            const newVideoSources = new Map<string, MediaSource>();
            const newAudioSources = new Map<string, MediaSource>();

            // Load video sources
            const videoLayer = layers.find((l) => l.type === "video");
            if (videoLayer) {
                for (const item of videoLayer.items) {
                    if (item.content) {
                        const input = await loadInput(item.content);
                        const videoTrack = input
                            ? await input.getPrimaryVideoTrack()
                            : null;
                        newVideoSources.set(item.id, {
                            id: item.id,
                            url: item.content,
                            input,
                            canvasSink: videoTrack
                                ? new CanvasSink(videoTrack)
                                : null,
                            audioBufferSink: null,
                            duration: item.duration,
                            isLoaded: !!input,
                        });
                    }
                }
            }

            // Load audio sources (voiceovers and music)
            for (const layer of layers) {
                if (layer.type === "voiceover" || layer.type === "music") {
                    for (const item of layer.items) {
                        if (item.content) {
                            const input = await loadInput(item.content);
                            const audioTrack = input
                                ? await input.getPrimaryAudioTrack()
                                : null;
                            newAudioSources.set(item.id, {
                                id: item.id,
                                url: item.content,
                                input,
                                canvasSink: null,
                                audioBufferSink: audioTrack
                                    ? new AudioBufferSink(audioTrack)
                                    : null,
                                duration: item.duration,
                                isLoaded: !!input,
                            });
                        }
                    }
                }
            }

            setVideoSources(newVideoSources);
            setAudioSources(newAudioSources);
            setIsInitializing(false);
            setIsReady(true);
        };

        if (layers.length > 0) {
            initSources();
        }
    }, [layers, loadInput]);

    // Playback animation loop
    useEffect(() => {
        if (!isPlaying) {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            return;
        }

        const animate = (timestamp: number) => {
            if (!lastFrameTimeRef.current) {
                lastFrameTimeRef.current = timestamp;
            }

            const deltaTime = (timestamp - lastFrameTimeRef.current) / 1000;
            lastFrameTimeRef.current = timestamp;

            setCurrentTime((prev) => {
                const newTime = prev + deltaTime;
                if (newTime >= totalDuration) {
                    setIsPlaying(false);
                    return 0;
                }
                onTimeUpdate?.(newTime);
                return newTime;
            });

            animationFrameRef.current = requestAnimationFrame(animate);
        };

        lastFrameTimeRef.current = 0;
        animationFrameRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [isPlaying, totalDuration, onTimeUpdate]);

    // Play control
    const play = useCallback(() => {
        if (audioContextRef.current?.state === "suspended") {
            audioContextRef.current.resume();
        }
        setIsPlaying(true);
    }, []);

    // Pause control
    const pause = useCallback(() => {
        setIsPlaying(false);
    }, []);

    // Seek control
    const seek = useCallback(
        (time: number) => {
            const clampedTime = Math.max(0, Math.min(time, totalDuration));
            setCurrentTime(clampedTime);
            onTimeUpdate?.(clampedTime);
        },
        [totalDuration, onTimeUpdate],
    );

    return {
        videoSources,
        audioSources,
        extractThumbnails,
        getThumbnailsForClip,
        play,
        pause,
        seek,
        isPlaying,
        currentTime,
        totalDuration,
        getFrameAtTime,
        getAudioBufferAtTime,
        isInitializing,
        isReady,
    };
}

// Utility function to clear caches (useful for cleanup)
export function clearMediabunnyCache() {
    inputCache.forEach((input) => {
        try {
            input.dispose();
        } catch {
            // Ignore cleanup errors
        }
    });
    inputCache.clear();

    thumbnailCache.forEach((frames) => {
        frames.forEach((bitmap) => bitmap.close());
    });
    thumbnailCache.clear();
}
