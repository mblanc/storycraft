"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Image from "next/image";

interface VideoThumbnailProps {
    src: string;
    duration: number; // Visible duration on timeline
    trimStart?: number; // Offset into source video (default: 0)
    originalDuration?: number; // Total duration of source video
    isResizing?: boolean; // Whether the clip is currently being resized
    className?: string;
}

// Fixed number of thumbnails to extract for the entire video
const THUMBNAILS_PER_VIDEO = 16;

// Cache structure: stores thumbnails and video duration
interface ThumbnailData {
    thumbnails: string[];
    videoDuration: number;
}

// Global cache for thumbnails - keyed by video URL only
const MAX_THUMBNAIL_CACHE_SIZE = 100;
const thumbnailCache = new Map<string, ThumbnailData>();
const loadingPromises = new Map<string, Promise<ThumbnailData>>();

export function VideoThumbnail({
    src,
    duration,
    trimStart = 0,
    originalDuration,
    isResizing = false,
    className,
}: VideoThumbnailProps) {
    // ...
    const [thumbnailData, setThumbnailData] = useState<ThumbnailData | null>(
        null,
    );
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const mountedRef = useRef(true);

    // Store committed values that only update when NOT resizing
    const [committedValues, setCommittedValues] = useState({
        duration,
        trimStart,
    });

    if (
        !isResizing &&
        (committedValues.duration !== duration ||
            committedValues.trimStart !== trimStart)
    ) {
        setCommittedValues({ duration, trimStart });
    }

    // Extract ALL thumbnails for the entire video once
    const extractAllThumbnails = useCallback(
        async (videoUrl: string): Promise<ThumbnailData> => {
            const cacheKey = videoUrl;

            // Check cache first
            if (thumbnailCache.has(cacheKey)) {
                return thumbnailCache.get(cacheKey)!;
            }

            // Check if already loading
            if (loadingPromises.has(cacheKey)) {
                return loadingPromises.get(cacheKey)!;
            }

            // Start new extraction
            const extractionPromise = new Promise<ThumbnailData>((resolve) => {
                const video = document.createElement("video");
                video.crossOrigin = "anonymous";
                video.muted = true;
                video.preload = "metadata";
                video.playsInline = true;

                const frames: string[] = [];
                let currentFrame = 0;
                let videoDuration = 0;

                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");

                const captureFrame = () => {
                    if (!ctx || currentFrame >= THUMBNAILS_PER_VIDEO) {
                        video.remove();
                        canvas.remove();
                        const data: ThumbnailData = {
                            thumbnails: frames,
                            videoDuration,
                        };

                        // Enforce cache size limit
                        if (thumbnailCache.size >= MAX_THUMBNAIL_CACHE_SIZE) {
                            const oldestKey = thumbnailCache
                                .keys()
                                .next().value;
                            if (oldestKey) {
                                thumbnailCache.delete(oldestKey);
                            }
                        }

                        thumbnailCache.set(cacheKey, data);
                        loadingPromises.delete(cacheKey);
                        resolve(data);
                        return;
                    }

                    // Set canvas dimensions based on video
                    const width = video.videoWidth || 320;
                    const height = video.videoHeight || 180;
                    canvas.width = width;
                    canvas.height = height;

                    ctx.drawImage(video, 0, 0, width, height);

                    try {
                        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
                        frames.push(dataUrl);
                    } catch (e) {
                        console.warn("Failed to capture frame:", e);
                    }

                    currentFrame++;
                    if (currentFrame < THUMBNAILS_PER_VIDEO) {
                        // Sample frames evenly across the entire video
                        const interval = videoDuration / THUMBNAILS_PER_VIDEO;
                        const nextTime = Math.min(
                            currentFrame * interval,
                            videoDuration - 0.1,
                        );
                        video.currentTime = nextTime;
                    } else {
                        video.remove();
                        canvas.remove();
                        const data: ThumbnailData = {
                            thumbnails: frames,
                            videoDuration,
                        };

                        // Enforce cache size limit
                        if (thumbnailCache.size >= MAX_THUMBNAIL_CACHE_SIZE) {
                            const oldestKey = thumbnailCache
                                .keys()
                                .next().value;
                            if (oldestKey) {
                                thumbnailCache.delete(oldestKey);
                            }
                        }

                        thumbnailCache.set(cacheKey, data);
                        loadingPromises.delete(cacheKey);
                        resolve(data);
                    }
                };

                video.addEventListener("loadedmetadata", () => {
                    videoDuration = video.duration;
                    // Start at the beginning
                    video.currentTime = 0.1;
                });

                video.addEventListener("seeked", captureFrame);

                video.addEventListener("error", (e) => {
                    console.error("Video load error:", e);
                    video.remove();
                    canvas.remove();
                    loadingPromises.delete(cacheKey);
                    resolve({ thumbnails: frames, videoDuration: 0 });
                });

                // Set a timeout to prevent hanging
                const timeout = setTimeout(() => {
                    if (frames.length === 0) {
                        video.remove();
                        canvas.remove();
                        loadingPromises.delete(cacheKey);
                        resolve({ thumbnails: frames, videoDuration: 0 });
                    }
                }, 10000);

                video.addEventListener("loadeddata", () => {
                    clearTimeout(timeout);
                });

                video.src = videoUrl;
                video.load();
            });

            loadingPromises.set(cacheKey, extractionPromise);
            return extractionPromise;
        },
        [],
    );

    // Load thumbnails once when src changes (NOT when trim/duration changes)
    useEffect(() => {
        mountedRef.current = true;

        const loadThumbnails = async () => {
            if (!src) {
                setIsLoading(false);
                setHasError(true);
                return;
            }

            // Check if already cached - no loading state needed
            if (thumbnailCache.has(src)) {
                setThumbnailData(thumbnailCache.get(src)!);
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            setHasError(false);

            try {
                const data = await extractAllThumbnails(src);
                if (mountedRef.current) {
                    setThumbnailData(data);
                    setIsLoading(false);
                    if (data.thumbnails.length === 0) {
                        setHasError(true);
                    }
                }
            } catch {
                if (mountedRef.current) {
                    setHasError(true);
                    setIsLoading(false);
                }
            }
        };

        void loadThumbnails();

        return () => {
            mountedRef.current = false;
        };
    }, [src, extractAllThumbnails]);

    // Calculate thumbnails - use committed values during resize for stability
    const { visibleThumbnails, thumbnailStripStyle } = useMemo(() => {
        if (!thumbnailData || thumbnailData.thumbnails.length === 0) {
            return { visibleThumbnails: [], thumbnailStripStyle: {} };
        }

        const { thumbnails, videoDuration } = thumbnailData;
        const actualVideoDuration = originalDuration || videoDuration;

        if (actualVideoDuration <= 0) {
            return { visibleThumbnails: thumbnails, thumbnailStripStyle: {} };
        }

        // Use committed values during resize, current values otherwise
        const stableDuration = isResizing ? committedValues.duration : duration;
        const stableTrimStart = isResizing
            ? committedValues.trimStart
            : trimStart;

        // Calculate how many thumbnails based on STABLE duration
        const THUMBNAILS_PER_SECOND = 0.5;
        const desiredCount = Math.max(
            1,
            Math.round(stableDuration * THUMBNAILS_PER_SECOND),
        );

        // Each source thumbnail represents a time range
        const timePerSourceThumbnail = actualVideoDuration / thumbnails.length;

        // Select thumbnails from the STABLE visible range
        const result: string[] = [];

        for (let i = 0; i < desiredCount; i++) {
            const timeOffset = (stableDuration * (i + 0.5)) / desiredCount;
            const targetTime = stableTrimStart + timeOffset;
            const sourceIndex = Math.floor(targetTime / timePerSourceThumbnail);
            const clampedIndex = Math.max(
                0,
                Math.min(sourceIndex, thumbnails.length - 1),
            );
            result.push(thumbnails[clampedIndex]);
        }

        // During resize, calculate offset to keep thumbnails visually stable
        let stripStyle = {};
        if (isResizing) {
            // Calculate how much the visible window has shifted
            const currentTrimStart = trimStart;
            const trimDelta = currentTrimStart - stableTrimStart;

            // Calculate the pixel offset based on how much time shifted
            // The strip needs to move in the opposite direction of the trim change
            const offsetPercent = (trimDelta / stableDuration) * 100;

            stripStyle = {
                transform: `translateX(${-offsetPercent}%)`,
                width: `${(stableDuration / duration) * 100}%`,
            };
        }

        return { visibleThumbnails: result, thumbnailStripStyle: stripStyle };
    }, [
        thumbnailData,
        trimStart,
        duration,
        originalDuration,
        isResizing,
        committedValues,
    ]);

    if (hasError) {
        return (
            <div
                className={`${className} flex items-center justify-center border border-blue-500 bg-blue-500/20`}
            >
                <span className="text-xs text-blue-400">Video</span>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div
                className={`${className} flex animate-pulse items-center justify-center bg-gray-800/50`}
            >
                <div className="flex gap-1">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div
                            key={i}
                            className="h-4 w-1.5 animate-bounce rounded-full bg-blue-500/50"
                            style={{ animationDelay: `${i * 0.1}s` }}
                        />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className={`${className} overflow-hidden rounded bg-black/20`}>
            <div
                className="grid h-full auto-cols-fr grid-flow-col gap-px"
                style={thumbnailStripStyle}
            >
                {visibleThumbnails.map((thumbnail, index) => (
                    <div
                        key={index}
                        className="relative h-full w-full overflow-hidden"
                    >
                        <Image
                            src={thumbnail}
                            alt={`Frame ${index + 1}`}
                            fill
                            unoptimized
                            className="object-cover"
                        />
                    </div>
                ))}
                {visibleThumbnails.length === 0 && (
                    <div className="h-full w-full border border-blue-500 bg-blue-500/20" />
                )}
            </div>
        </div>
    );
}

// Utility to clear thumbnail cache
export function clearThumbnailCache() {
    thumbnailCache.clear();
    loadingPromises.clear();
}
