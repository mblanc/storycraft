"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";

interface AudioWaveformProps {
    src: string;
    className?: string;
    color?: string;
    duration: number;
    trimStart?: number;
    originalDuration?: number;
    isResizing?: boolean;
}

// Cache for waveform data - keyed by audio URL only
interface WaveformData {
    waveform: number[];
    audioDuration: number;
}

const waveformCache = new Map<string, WaveformData>();
const loadingPromises = new Map<string, Promise<WaveformData>>();
const MAX_WAVEFORM_CACHE_SIZE = 100;

// Fixed number of bars to extract for the full audio
const BARS_PER_AUDIO = 200;

// Bars per second for display
const DISPLAY_BARS_PER_SECOND = 10;

export function AudioWaveform({
    src,
    className,
    color = "bg-green-500",
    duration,
    trimStart = 0,
    originalDuration,
    isResizing = false,
}: AudioWaveformProps) {
    // ...
    const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
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

    // Extract waveform for the FULL audio once
    const extractFullWaveform = useCallback(
        async (audioUrl: string): Promise<WaveformData> => {
            const cacheKey = audioUrl;

            // Check cache
            if (waveformCache.has(cacheKey)) {
                return waveformCache.get(cacheKey)!;
            }

            // Check if already loading
            if (loadingPromises.has(cacheKey)) {
                return loadingPromises.get(cacheKey)!;
            }

            const extractionPromise = (async (): Promise<WaveformData> => {
                try {
                    const audioContext = new AudioContext();
                    const response = await fetch(audioUrl);

                    if (!response.ok) {
                        throw new Error(
                            `HTTP error! status: ${response.status}`,
                        );
                    }

                    const arrayBuffer = await response.arrayBuffer();
                    const audioBuffer =
                        await audioContext.decodeAudioData(arrayBuffer);
                    const audioDuration = audioBuffer.duration;

                    const blockSize = Math.floor(
                        audioBuffer.length / BARS_PER_AUDIO,
                    );
                    const waveform: number[] = [];
                    const channelData = audioBuffer.getChannelData(0);

                    for (let i = 0; i < BARS_PER_AUDIO; i++) {
                        const start = blockSize * i;
                        let sum = 0;
                        const end = Math.min(
                            start + blockSize,
                            channelData.length,
                        );
                        for (let j = start; j < end; j++) {
                            sum += Math.abs(channelData[j]);
                        }
                        waveform.push(sum / blockSize);
                    }

                    // Normalize
                    const max = Math.max(...waveform, 0.001);
                    const normalized = waveform.map((v) => v / max);

                    await audioContext.close();

                    const data: WaveformData = {
                        waveform: normalized,
                        audioDuration,
                    };

                    // Enforce cache size limit
                    if (waveformCache.size >= MAX_WAVEFORM_CACHE_SIZE) {
                        const oldestKey = waveformCache.keys().next().value;
                        if (oldestKey) {
                            waveformCache.delete(oldestKey);
                        }
                    }

                    waveformCache.set(cacheKey, data);
                    loadingPromises.delete(cacheKey);
                    return data;
                } catch (error) {
                    console.error("Waveform extraction failed:", error);
                    loadingPromises.delete(cacheKey);
                    // Return placeholder data
                    return {
                        waveform: Array(BARS_PER_AUDIO)
                            .fill(0)
                            .map(() => 0.3 + Math.random() * 0.4),
                        audioDuration: duration,
                    };
                }
            })();

            loadingPromises.set(cacheKey, extractionPromise);
            return extractionPromise;
        },
        [duration],
    );

    // Load waveform data once when src changes
    useEffect(() => {
        mountedRef.current = true;

        const loadWaveform = async () => {
            if (!src) {
                setIsLoading(false);
                return;
            }

            // Check if already cached
            if (waveformCache.has(src)) {
                setWaveformData(waveformCache.get(src)!);
                setIsLoading(false);
                return;
            }

            setIsLoading(true);

            try {
                const data = await extractFullWaveform(src);
                if (mountedRef.current) {
                    setWaveformData(data);
                    setIsLoading(false);
                }
            } catch {
                if (mountedRef.current) {
                    setIsLoading(false);
                }
            }
        };

        void loadWaveform();

        return () => {
            mountedRef.current = false;
        };
    }, [src, extractFullWaveform]);

    // Calculate which waveform bars to display based on trimStart and duration
    const { visibleBars, barStripStyle } = useMemo(() => {
        if (!waveformData || waveformData.waveform.length === 0) {
            return { visibleBars: [], barStripStyle: {} };
        }

        const { waveform, audioDuration } = waveformData;
        const actualAudioDuration = originalDuration || audioDuration;

        if (actualAudioDuration <= 0) {
            return { visibleBars: waveform, barStripStyle: {} };
        }

        // Use committed values during resize, current values otherwise
        const stableDuration = isResizing ? committedValues.duration : duration;
        const stableTrimStart = isResizing
            ? committedValues.trimStart
            : trimStart;

        // Calculate how many bars to display based on STABLE duration
        const desiredCount = Math.max(
            5,
            Math.round(stableDuration * DISPLAY_BARS_PER_SECOND),
        );

        // Each source bar represents a time range
        const timePerSourceBar = actualAudioDuration / waveform.length;

        // Select bars from the STABLE visible range
        const result: number[] = [];

        for (let i = 0; i < desiredCount; i++) {
            const timeOffset = (stableDuration * (i + 0.5)) / desiredCount;
            const targetTime = stableTrimStart + timeOffset;
            const sourceIndex = Math.floor(targetTime / timePerSourceBar);
            const clampedIndex = Math.max(
                0,
                Math.min(sourceIndex, waveform.length - 1),
            );
            result.push(waveform[clampedIndex]);
        }

        // During resize, calculate offset to keep bars visually stable
        let stripStyle = {};
        if (isResizing) {
            const currentTrimStart = trimStart;
            const trimDelta = currentTrimStart - stableTrimStart;
            const offsetPercent = (trimDelta / stableDuration) * 100;

            stripStyle = {
                transform: `translateX(${-offsetPercent}%)`,
                width: `${(stableDuration / duration) * 100}%`,
            };
        }

        return { visibleBars: result, barStripStyle: stripStyle };
    }, [
        waveformData,
        trimStart,
        duration,
        originalDuration,
        isResizing,
        committedValues,
    ]);

    // Use same calculation for loading placeholder
    const loadingBarCount = Math.max(
        5,
        Math.round(duration * DISPLAY_BARS_PER_SECOND),
    );

    if (isLoading) {
        return (
            <div
                className={`${className} flex items-center gap-px overflow-hidden`}
            >
                {Array.from({ length: Math.min(loadingBarCount, 50) }).map(
                    (_, index) => (
                        <div
                            key={index}
                            className={`${color} flex-1 animate-pulse rounded-sm opacity-30`}
                            style={{
                                height: `${30 + ((index * 37) % 41)}%`,
                                animationDelay: `${index * 0.05}s`,
                            }}
                        />
                    ),
                )}
            </div>
        );
    }

    return (
        <div className={`${className} overflow-hidden`}>
            <div
                className="flex h-full items-center gap-px"
                style={barStripStyle}
            >
                {visibleBars.map((height, index) => (
                    <div
                        key={index}
                        className={`${color} flex-1 rounded-sm transition-all duration-75`}
                        style={{
                            height: `${Math.max(15, height * 100)}%`,
                            opacity: 0.6 + height * 0.4,
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

// Utility to clear waveform cache
export function clearWaveformCache() {
    waveformCache.clear();
    loadingPromises.clear();
}
