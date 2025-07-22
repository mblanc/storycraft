import { Button } from "@/components/ui/button";
import { Film, Loader2 } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, useCallback } from "react";
import { Scenario, TimelineItem } from "../../types";
import { AudioWaveform } from "./audio-wave-form";
import { VideoThumbnail } from "./video-thumbnail";
import { TimelineLayer } from "@/app/types";
import { getAudioUrl, getVideoUrl } from "@/lib/mediaProxy";

interface EditorTabProps {
  scenario: Scenario;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onTimelineItemUpdate: (
    layerId: string,
    itemId: string,
    updates: Partial<TimelineItem>
  ) => void;
  logoOverlay: string | null;
  setLogoOverlay: (logo: string | null) => void;
  onLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onLogoRemove: () => void;
  onGenerateMusic: () => Promise<void>;
  isGeneratingMusic?: boolean;
  onGenerateVoiceover: () => Promise<void>;
  isGeneratingVoiceover?: boolean;
  onExportMovie: (layers: TimelineLayer[]) => Promise<void>;
  isExporting?: boolean;
}

const TIMELINE_DURATION = 65; // Total timeline duration in seconds
const MARKER_INTERVAL = 5; // Time marker interval in seconds
const SCENE_DURATION = 8; // Duration of each scene in seconds
const CLIP_PADDING = 2; // Padding between clips in pixels
const FADE_DURATION = 0.15; // 150ms for audio fade-in/out

// Format time in mm:SS format
const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
};

export function EditorTab({
  scenario,
  currentTime,
  onTimeUpdate,
  logoOverlay,
  onGenerateMusic,
  isGeneratingMusic = false,
  onGenerateVoiceover,
  isGeneratingVoiceover = false,
  onExportMovie,
  isExporting = false,
}: EditorTabProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [selectedItem, setSelectedItem] = useState<{
    layerId: string;
    itemId: string;
  } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartTime, setResizeStartTime] = useState(0);
  const [resizeStartDuration, setResizeStartDuration] = useState(0);
  const [resizeHandle, setResizeHandle] = useState<"start" | "end" | null>(
    null
  );

  // Add new state for tracking playback
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null);

  // Audio-related refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const activeAudioNodes = useRef<
    Map<
      string,
      {
        source: AudioBufferSourceNode;
        gainNode: GainNode;
        type: "voiceover" | "music";
        fadeOutTimeoutId?: NodeJS.Timeout;
        stopTime?: number;
        removalTimeoutId?: NodeJS.Timeout;
      }
    >
  >(new Map());
  const lastProcessedScenario = useRef<string>("");

  const [layers, setLayers] = useState<TimelineLayer[]>([
    {
      id: "videos",
      name: "Videos",
      type: "video",
      items: scenario.scenes.map((scene, index) => ({
        id: `video-${index}`,
        startTime: index * SCENE_DURATION,
        duration: SCENE_DURATION,
        content: "", // Will be updated when videoUri is resolved
        type: "video",
        metadata: {
          logoOverlay: scenario.logoOverlay || undefined,
        },
      })),
    },
    {
      id: "voiceovers",
      name: "Voiceovers",
      type: "voiceover",
      items: [], // Empty items array, will be populated when voiceovers are generated
    },
    {
      id: "music",
      name: "Music",
      type: "music",
      items: [], // Empty items array, will be populated when music is generated
    },
  ]);

  // Add function to get audio duration
  const getAudioDuration = async (url: string): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio(url);
      audio.addEventListener("loadedmetadata", () => {
        resolve(audio.duration);
      });
      audio.addEventListener("error", () => {
        console.error("Error loading audio:", url);
        resolve(SCENE_DURATION); // Fallback to scene duration if audio fails to load
      });
    });
  };

  // Update resolveUrlsAndUpdateLayers to handle empty items arrays
  useEffect(() => {
    const resolveUrlsAndUpdateLayers = async () => {
      // Skip if no scenes to process
      if (!scenario?.scenes || scenario.scenes.length === 0) return;

      // Create a unique identifier for this scenario to prevent reprocessing
      const scenarioId = JSON.stringify({
        scenes: scenario.scenes.map((s) => ({
          videoUri: s.videoUri,
          voiceoverAudioUri: s.voiceoverAudioUri,
        })),
        musicUrl: scenario.musicUrl,
      });

      // Skip if we've already processed this exact scenario
      if (lastProcessedScenario.current === scenarioId) return;
      lastProcessedScenario.current = scenarioId;

      const updatedLayers = JSON.parse(
        JSON.stringify(layers)
      ) as TimelineLayer[]; // Deep copy

      const videoLayer = updatedLayers.find((layer) => layer.id === "videos");
      const voiceoverLayer = updatedLayers.find(
        (layer) => layer.id === "voiceovers"
      );
      const musicLayer = updatedLayers.find((layer) => layer.id === "music");

      if (videoLayer) {
        for (let i = 0; i < scenario.scenes.length; i++) {
          const scene = scenario.scenes[i];
          if (scene.videoUri) {
            try {
              const url =
                typeof scene.videoUri === "string"
                  ? scene.videoUri
                  : await scene.videoUri;

              // Update the video layer item content directly
              const videoItem = videoLayer.items[i];
              if (videoItem) {
                videoItem.content = url;
              }
            } catch (error) {
              console.error(`Error resolving video URL for scene ${i}:`, error);
            }
          }
        }
      }

      if (voiceoverLayer) {
        // Only add voiceover items if they exist in the scenario
        const voiceoverItems: TimelineItem[] = [];
        for (let i = 0; i < scenario.scenes.length; i++) {
          const scene = scenario.scenes[i];
          if (scene.voiceoverAudioUri) {
            try {
              const url =
                typeof scene.voiceoverAudioUri === "string"
                  ? scene.voiceoverAudioUri
                  : await scene.voiceoverAudioUri;

              // Get the actual duration of the audio file
              const duration = await getAudioDuration(url);

              // Add a new voiceover item
              voiceoverItems.push({
                id: `voiceover-${i}`,
                startTime: i * SCENE_DURATION,
                duration: duration,
                content: url,
                type: "voiceover",
              });
            } catch (error) {
              console.error(`Error resolving voiceover for scene ${i}:`, error);
            }
          }
        }
        voiceoverLayer.items = voiceoverItems;
      }

      if (musicLayer) {
        // Only add music item if it exists in the scenario
        if (scenario.musicUrl) {
          try {
            const url = scenario.musicUrl || "";
            if (url) {
              const duration = await getAudioDuration(url);
              musicLayer.items = [
                {
                  id: "background-music",
                  startTime: 0,
                  duration: duration,
                  content: url,
                  type: "music",
                },
              ];
            }
          } catch (error) {
            console.error(`Error resolving music:`, error);
          }
        } else {
          musicLayer.items = []; // Ensure music layer is empty if no music
        }
      }

      setLayers(updatedLayers);
    };

    resolveUrlsAndUpdateLayers();
  }, [scenario, layers]); // Need layers dependency to read current state

  const handleItemClick = (
    e: React.MouseEvent,
    layerId: string,
    itemId: string
  ) => {
    e.stopPropagation(); // Prevent timeline click
    setSelectedItem({ layerId, itemId });
  };

  const handleResizeStart = (
    e: React.MouseEvent,
    layerId: string,
    itemId: string,
    handle: "start" | "end"
  ) => {
    e.stopPropagation();
    setIsResizing(true);
    setResizeHandle(handle);
    setResizeStartX(e.clientX);
    setSelectedItem({ layerId, itemId });

    const layer = layers.find((l) => l.id === layerId);
    const item = layer?.items.find((i) => i.id === itemId);
    if (item) {
      setResizeStartTime(item.startTime);
      setResizeStartDuration(item.duration);
    }

    // Add global mouse event listeners
    document.addEventListener("mousemove", handleResizeMove as EventListener);
    document.addEventListener("mouseup", handleResizeEnd);
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!isResizing || !timelineRef.current || !selectedItem || !resizeHandle)
      return;

    const rect = timelineRef.current.getBoundingClientRect();
    const timeScale = rect.width / TIMELINE_DURATION;
    const deltaX = e.clientX - resizeStartX;
    const deltaTime = deltaX / timeScale;

    const updatedLayers = layers.map((layer) => {
      if (layer.id !== selectedItem.layerId) return layer;

      return {
        ...layer,
        items: layer.items.map((item) => {
          if (item.id !== selectedItem.itemId) return item;

          let newStartTime = item.startTime;
          let newDuration = item.duration;

          if (resizeHandle === "start") {
            newStartTime = Math.max(
              0,
              Math.min(
                resizeStartTime + deltaTime,
                item.startTime + item.duration - 1
              )
            );
            newDuration =
              resizeStartDuration - (newStartTime - resizeStartTime);
          } else {
            newDuration = Math.max(1, resizeStartDuration + deltaTime);
          }

          return { ...item, startTime: newStartTime, duration: newDuration };
        }),
      };
    });

    setLayers(updatedLayers);
  };

  const handleResizeEnd = () => {
    setIsResizing(false);
    setResizeHandle(null);

    // Remove global mouse event listeners
    document.removeEventListener(
      "mousemove",
      handleResizeMove as EventListener
    );
    document.removeEventListener("mouseup", handleResizeEnd);
  };

  // Function to get the current audio clips based on timeline time
  const getCurrentAudioClips = useCallback(
    (time: number) => {
      const voiceoverLayer = layers.find((layer) => layer.id === "voiceovers");
      const musicLayer = layers.find((layer) => layer.id === "music");
      const clips: {
        id: string;
        url: string;
        startTime: number;
        type: "voiceover" | "music";
      }[] = [];

      // Get current voiceover
      if (voiceoverLayer) {
        const voiceoverClip = voiceoverLayer.items.find(
          (item) =>
            time >= item.startTime && time < item.startTime + item.duration
        );
        if (voiceoverClip && voiceoverClip.content) {
          clips.push({
            id: voiceoverClip.id,
            url: voiceoverClip.content,
            startTime: time - voiceoverClip.startTime,
            type: "voiceover",
          });
        }
      }

      // Get current music
      if (musicLayer) {
        const musicClip = musicLayer.items.find(
          (item) =>
            time >= item.startTime && time < item.startTime + item.duration
        );
        if (musicClip && musicClip.content) {
          clips.push({
            id: musicClip.id,
            url: musicClip.content,
            startTime: time - musicClip.startTime,
            type: "music",
          });
        }
      }

      return clips;
    },
    [layers]
  );

  // Function to get the current video clip based on timeline time
  const getCurrentVideoClip = useCallback(
    (time: number) => {
      const videoLayer = layers.find((layer) => layer.id === "videos");
      if (!videoLayer) return null;

      const currentClip = videoLayer.items.find(
        (item) =>
          time >= item.startTime && time < item.startTime + item.duration
      );

      if (!currentClip || !currentClip.content) return null;

      return {
        url: currentClip.content,
        startTime: time - currentClip.startTime,
        clipStartTime: currentClip.startTime,
        clipDuration: currentClip.duration,
      };
    },
    [layers]
  );

  // Initialize audio context and general cleanup
  useEffect(() => {
    const audioNodes = activeAudioNodes.current;
    const audioBuffers = audioBuffersRef.current;

    const initAudioContext = async () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({
          latencyHint: "playback",
          sampleRate: 48000,
        });

        const resumeAudio = async () => {
          if (audioContextRef.current?.state === "suspended") {
            try {
              await audioContextRef.current.resume();
            } catch (error) {
              console.error("Error resuming audio context:", error);
            }
          }
        };
        document.addEventListener("click", resumeAudio, { once: true });
        document.addEventListener("keydown", resumeAudio, { once: true });
      }
    };
    initAudioContext();

    return () => {
      // Component unmount cleanup
      const audioContext = audioContextRef.current;
      if (audioContext) {
        audioNodes.forEach(({ source, gainNode, fadeOutTimeoutId }) => {
          if (fadeOutTimeoutId) clearTimeout(fadeOutTimeoutId);
          try {
            gainNode.gain.cancelScheduledValues(audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime); // Cut immediately
            source.stop(audioContext.currentTime);
            source.disconnect();
            gainNode.disconnect();
          } catch {
            /* Ignore errors */
          }
        });
        audioNodes.clear();

        audioBuffers.clear();

        audioContext.close().catch(console.error);
        audioContextRef.current = null;
      }
    };
  }, []);

  // Function to load audio buffer
  const loadAudioBuffer = async (url: string): Promise<AudioBuffer> => {
    // Don't load if URL is empty, undefined, null, or invalid
    if (
      !url ||
      typeof url !== "string" ||
      url.trim() === "" ||
      url === "null" ||
      url === "undefined"
    ) {
      throw new Error("Audio URL is invalid or empty");
    }

    if (audioBuffersRef.current.has(url)) {
      return audioBuffersRef.current.get(url)!;
    }
    if (!audioContextRef.current) {
      throw new Error("AudioContext not initialized");
    }

    try {
      // Get the appropriate audio URL (proxy if needed)
      const fetchUrl = getAudioUrl(url);

      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContextRef.current!.decodeAudioData(
        arrayBuffer
      );
      audioBuffersRef.current.set(url, audioBuffer);
      return audioBuffer;
    } catch (error) {
      console.error(`Error loading audio ${url}:`, error);
      throw error;
    }
  };

  // Pre-buffer all audio files when layers change
  useEffect(() => {
    const loadAllAudio = async () => {
      if (!audioContextRef.current) return;
      const audioUrlsToLoad = new Set<string>();
      layers.forEach((layer) => {
        if (
          (layer.type === "voiceover" || layer.type === "music") &&
          layer.items
        ) {
          layer.items.forEach((item) => {
            if (item.content && item.content.trim() !== "") {
              audioUrlsToLoad.add(item.content);
            }
          });
        }
      });

      // Only proceed if there are actual audio URLs to load
      if (audioUrlsToLoad.size === 0) {
        console.log("No audio URLs to load");
        return;
      }

      for (const url of audioUrlsToLoad) {
        if (url && url.trim() !== "" && !audioBuffersRef.current.has(url)) {
          try {
            await loadAudioBuffer(url);
          } catch (error) {
            console.warn(`Failed to load audio buffer for URL: ${url}`, error);
            // Continue loading other audio files even if one fails
          }
        }
      }
    };

    if (layers.length > 0) {
      loadAllAudio();
    }
  }, [layers]);

  // Main playback synchronization effect for Audio and Video
  useEffect(() => {
    const audioContext = audioContextRef.current;
    const video = videoRef.current;
    const audioNodes = activeAudioNodes.current;

    if (!audioContext || !video) {
      // If context or video isn't ready, ensure all audio is stopped.
      audioNodes.forEach(({ source, gainNode, fadeOutTimeoutId }) => {
        if (fadeOutTimeoutId) clearTimeout(fadeOutTimeoutId);
        try {
          gainNode.gain.cancelScheduledValues(audioContext?.currentTime ?? 0);
          source.stop();
        } catch {}
      });
      audioNodes.clear();
      return;
    }

    const currentTimelineTime = currentTime; // Capture for stable use in this effect run

    // --- Audio Management ---
    const desiredPlayingAudioClips = isPlaying
      ? getCurrentAudioClips(currentTimelineTime)
      : [];
    const desiredPlayingClipIds = new Set(
      desiredPlayingAudioClips.map((c) => c.id)
    );

    // 1. Fade out and stop clips that are no longer desired or need restart
    audioNodes.forEach((node, clipId) => {
      if (!desiredPlayingClipIds.has(clipId)) {
        if (node.fadeOutTimeoutId) clearTimeout(node.fadeOutTimeoutId);

        node.gainNode.gain.cancelScheduledValues(audioContext.currentTime);
        // Start fade from current gain value for smoother transition if already fading
        const currentGain = node.gainNode.gain.value;
        node.gainNode.gain.setValueAtTime(
          currentGain,
          audioContext.currentTime
        );
        node.gainNode.gain.exponentialRampToValueAtTime(
          0.0001,
          audioContext.currentTime + FADE_DURATION
        );

        const stopTimeForNode = audioContext.currentTime + FADE_DURATION;
        try {
          node.source.stop(stopTimeForNode);
        } catch {
          /* Already stopped or invalid state */
        }
        node.stopTime = stopTimeForNode; // Mark for cleanup

        // Schedule for actual map removal after fade out
        const removalTimeoutId = setTimeout(() => {
          if (audioNodes.get(clipId) === node) {
            audioNodes.delete(clipId);
          }
        }, FADE_DURATION * 1000 + 50); // 50ms buffer
        node.removalTimeoutId = removalTimeoutId; // Store for potential clear on unmount
      }
    });

    // 2. Start new clips
    for (const clip of desiredPlayingAudioClips) {
      if (!audioNodes.has(clip.id)) {
        const playNewAudioClipAsync = async () => {
          // Re-check conditions as state might have changed during async ops or if clip is already added
          if (
            !audioContextRef.current ||
            !isPlaying ||
            currentTime !== currentTimelineTime ||
            audioNodes.has(clip.id)
          ) {
            return;
          }
          const currentContext = audioContextRef.current; // Use captured context

          try {
            const buffer = await loadAudioBuffer(clip.url);
            // Final check before playing
            if (
              !isPlaying ||
              currentTime !== currentTimelineTime ||
              audioNodes.has(clip.id)
            )
              return;

            const source = currentContext.createBufferSource();
            const gainNode = currentContext.createGain();
            source.buffer = buffer;
            source.connect(gainNode);
            gainNode.connect(currentContext.destination);

            const targetVolume = clip.type === "voiceover" ? 0.8 : 0.5; // Adjusted volumes
            gainNode.gain.setValueAtTime(0.0001, currentContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(
              targetVolume,
              currentContext.currentTime + FADE_DURATION
            );

            const offsetInClipFile = Math.max(0, clip.startTime); // clip.startTime is offset into the audio file
            source.start(currentContext.currentTime, offsetInClipFile);

            // Find the original timeline item for its duration on the timeline
            const layer = layers.find((l) =>
              l.items.some((i) => i.id === clip.id)
            );
            const timelineItem = layer?.items.find((i) => i.id === clip.id);

            if (!timelineItem) {
              console.warn(
                "Timeline item not found for audio clip:",
                clip.id,
                ". Playing for natural duration."
              );
              // Fallback: play for natural duration if timelineItem not found
              const naturalDurationRemaining =
                buffer.duration - offsetInClipFile;
              if (naturalDurationRemaining > 0) {
                const naturalStopTime =
                  currentContext.currentTime + naturalDurationRemaining;
                const naturalFadeOutPoint = naturalStopTime - FADE_DURATION;
                if (
                  naturalFadeOutPoint >
                  currentContext.currentTime + FADE_DURATION
                ) {
                  gainNode.gain.setValueAtTime(
                    targetVolume,
                    naturalFadeOutPoint
                  );
                  gainNode.gain.exponentialRampToValueAtTime(
                    0.0001,
                    naturalStopTime
                  );
                } else {
                  gainNode.gain.exponentialRampToValueAtTime(
                    0.0001,
                    naturalStopTime
                  );
                }
                source.stop(naturalStopTime);
                audioNodes.set(clip.id, {
                  source,
                  gainNode,
                  type: clip.type,
                  stopTime: naturalStopTime,
                });
              } else {
                try {
                  source.stop(currentContext.currentTime);
                } catch {} // stop immediately if no duration
              }
              return;
            }

            // Calculate how long this specific segment of the clip should play based on timeline
            const timeIntoTimelineItemView =
              currentTimelineTime - timelineItem.startTime;
            const remainingDurationInTimelineItemView = Math.max(
              0,
              timelineItem.duration - timeIntoTimelineItemView
            );
            const remainingDurationInAudioContentItself = Math.max(
              0,
              buffer.duration - offsetInClipFile
            );

            const actualPlaybackDuration = Math.min(
              remainingDurationInTimelineItemView,
              remainingDurationInAudioContentItself
            );

            if (actualPlaybackDuration <= 0) {
              try {
                source.stop(currentContext.currentTime);
              } catch {}
              return; // No duration to play
            }

            const scheduledStopTime =
              currentContext.currentTime + actualPlaybackDuration;
            const fadeOutStartTime = scheduledStopTime - FADE_DURATION;

            if (fadeOutStartTime > currentContext.currentTime + FADE_DURATION) {
              gainNode.gain.setValueAtTime(targetVolume, fadeOutStartTime); // Hold target volume until fade
              gainNode.gain.exponentialRampToValueAtTime(
                0.0001,
                scheduledStopTime
              );
            } else {
              // Clip is too short for full fade-in then separate fade-out
              gainNode.gain.exponentialRampToValueAtTime(
                0.0001,
                scheduledStopTime
              );
            }
            source.stop(scheduledStopTime);

            const nodeData = {
              source,
              gainNode,
              type: clip.type,
              stopTime: scheduledStopTime,
            } as {
              source: AudioBufferSourceNode;
              gainNode: GainNode;
              type: "voiceover" | "music";
              fadeOutTimeoutId?: NodeJS.Timeout;
              stopTime?: number;
              removalTimeoutId?: NodeJS.Timeout;
            };
            audioNodes.set(clip.id, nodeData);

            // Schedule self-removal from map after it's supposed to stop
            const cleanupTimeoutId = setTimeout(() => {
              if (audioNodes.get(clip.id) === nodeData) {
                // Ensure it's the same node
                audioNodes.delete(clip.id);
              }
            }, actualPlaybackDuration * 1000 + FADE_DURATION * 1000 + 100); // Buffer for cleanup
            nodeData.fadeOutTimeoutId = cleanupTimeoutId; // Store for potential early clear
          } catch (error) {
            console.error(`Error playing audio ${clip.url}:`, error);
            audioNodes.delete(clip.id); // Clean up if error
          }
        };
        playNewAudioClipAsync();
      }
    }

    // --- Video Management ---
    const currentVideoClip = getCurrentVideoClip(currentTimelineTime);
    if (currentVideoClip) {
      if (currentVideoUrl !== currentVideoClip.url) {
        setCurrentVideoUrl(currentVideoClip.url);
        // Get the appropriate video URL (proxy if needed)
        const videoSrc = getVideoUrl(currentVideoClip.url);
        video.src = videoSrc;
        video.currentTime = currentVideoClip.startTime; // startTime is offset within the video file
      } else {
        // Sync video's internal time with where it should be, if off by a bit
        const expectedVideoInternalTime =
          currentTimelineTime - currentVideoClip.clipStartTime;
        if (Math.abs(video.currentTime - expectedVideoInternalTime) > 0.2) {
          // 200ms tolerance
          video.currentTime = expectedVideoInternalTime;
        }
      }

      if (isPlaying) {
        video.play().catch((error) => {
          console.error("Error playing video:", error);
          setIsPlaying(false); // Stop if video fails
        });
      } else {
        video.pause();
      }
    } else {
      video.pause();
      // setCurrentVideoUrl(null); // Keep current video displayed when paused at end of clip but not end of timeline
    }

    return () => {
      // Cleanup for this effect instance when dependencies change (not full unmount)
      // Clear any scheduled map removal timeouts for nodes that might be re-evaluated.
      audioNodes.forEach((node) => {
        if (node.removalTimeoutId) {
          clearTimeout(node.removalTimeoutId);
          delete node.removalTimeoutId;
        }
        // If a node was started in this effect run via an async call that hasn't completed,
        // the re-checks (`!isPlaying || currentTime !== currentTimelineTime`) inside async should prevent issues.
      });
    };
  }, [
    currentTime,
    isPlaying,
    layers,
    scenario,
    currentVideoUrl,
    getCurrentAudioClips,
    getCurrentVideoClip,
  ]);

  // Handle video time update (mostly for driving the main timeline currentTime)
  const handleVideoTimeUpdate = () => {
    if (!videoRef.current || !isPlaying) return;

    const video = videoRef.current;
    const currentClip = getCurrentVideoClip(currentTime);

    if (currentClip) {
      const newTime = currentClip.clipStartTime + video.currentTime;
      if (newTime >= currentClip.clipStartTime + currentClip.clipDuration) {
        // Move to next clip
        const videoLayer = layers.find((layer) => layer.id === "videos");
        if (!videoLayer) return;

        const currentClipIndex = videoLayer.items.findIndex(
          (item) => item.startTime === currentClip.clipStartTime
        );

        if (currentClipIndex < videoLayer.items.length - 1) {
          const nextClip = videoLayer.items[currentClipIndex + 1];
          onTimeUpdate(nextClip.startTime);
        } else {
          // End of timeline
          setIsPlaying(false);
          onTimeUpdate(0);
        }
      } else {
        onTimeUpdate(newTime);
      }
    }
  };

  // Handle video ended event
  const handleVideoEnded = () => {
    if (!isPlaying) return;

    const videoLayer = layers.find((layer) => layer.id === "videos");
    if (!videoLayer) return;

    const currentClipIndex = videoLayer.items.findIndex(
      (item) =>
        currentTime >= item.startTime &&
        currentTime < item.startTime + item.duration
    );

    if (currentClipIndex < videoLayer.items.length - 1) {
      // Move to the next clip
      const nextClip = videoLayer.items[currentClipIndex + 1];
      onTimeUpdate(nextClip.startTime);
    } else {
      // End of timeline
      setIsPlaying(false);
      onTimeUpdate(0);
    }
  };

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    console.log("togglePlay called, current isPlaying:", isPlaying);
    const audioCtx = audioContextRef.current;
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    setIsPlaying(!isPlaying);
    console.log("isPlaying set to:", !isPlaying);
  }, [isPlaying]);

  // Add keyboard event listener for spacebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only toggle if spacebar is pressed and we're not in an input field
      if (
        e.code === "Space" &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
      ) {
        e.preventDefault(); // Prevent page scroll
        console.log("Spacebar pressed, current isPlaying:", isPlaying);
        togglePlay();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPlaying, togglePlay]); // Add dependencies for current values

  // Handle timeline click
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const clickPosition = e.clientX - rect.left;
    const timeScale = rect.width / TIMELINE_DURATION;
    const newTime = Math.max(
      0,
      Math.min(TIMELINE_DURATION, clickPosition / timeScale)
    );

    // Update time and pause playback
    setIsPlaying(false);
    onTimeUpdate(newTime);
  };

  return (
    <div className="space-y-8">
      {/* Header with Export Movie button */}
      <div className="flex justify-end">
        <Button
          onClick={() => onExportMovie(layers)}
          disabled={isExporting}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {isExporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Exporting Movie...
            </>
          ) : (
            <>
              <Film className="mr-2 h-4 w-4" />
              Export Movie
            </>
          )}
        </Button>
      </div>

      {/* Video Preview */}
      <div className="w-full max-w-3xl mx-auto relative">
        <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            onTimeUpdate={handleVideoTimeUpdate}
            onEnded={handleVideoEnded}
            onLoadedMetadata={(e) => {
              const video = e.currentTarget;
              video.volume = 0.5;
            }}
            playsInline={true}
            preload="auto"
          />
          {logoOverlay && (
            <div className="absolute top-4 right-4 w-24 aspect-video">
              <Image
                src={logoOverlay}
                alt="Logo Overlay"
                className="w-full h-full object-contain"
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
            </div>
          )}
        </div>
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
          <Button
            variant="secondary"
            size="icon"
            onClick={togglePlay}
            className="bg-black/50 hover:bg-green-500 hover:text-white"
          >
            {isPlaying ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
            <span className="sr-only">{isPlaying ? "Pause" : "Play"}</span>
          </Button>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-2">
        {/* Timeline Header */}
        <div
          ref={timelineRef}
          className="relative w-full bg-gray-100 rounded-lg cursor-pointer"
          onClick={handleTimelineClick}
        >
          {/* Time markers and layers container */}
          <div className="relative pt-4 pb-4">
            {/* Time markers */}
            <div className="absolute top-0 left-0 right-0 h-6 flex justify-between text-xs text-gray-500">
              {Array.from({
                length: TIMELINE_DURATION / MARKER_INTERVAL + 1,
              }).map((_, i) => (
                <div
                  key={i}
                  className="relative"
                  style={{
                    left:
                      i === 0
                        ? "0"
                        : i === TIMELINE_DURATION / MARKER_INTERVAL
                        ? "auto"
                        : undefined,
                  }}
                >
                  <div className="absolute -top-4 left-0 transform -translate-x-1/2 select-none">
                    {formatTime(i * MARKER_INTERVAL)}
                  </div>
                  <div className="absolute top-0 left-0 w-px h-6 bg-gray-300" />
                </div>
              ))}
            </div>

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-px bg-red-500 z-10"
              style={{
                left: `${(currentTime / TIMELINE_DURATION) * 100}%`,
                height: "100%",
              }}
            >
              <div className="absolute -top-2 -left-2 w-4 h-4 bg-red-500 rounded-full" />
            </div>

            {/* Layers */}
            <div className="mt-6 space-y-1">
              {layers.map((layer) => (
                <div
                  key={layer.id}
                  className="relative h-12 bg-white rounded border border-gray-200"
                >
                  <div className="absolute -left-24 top-0 h-full flex items-center px-2 text-sm font-medium select-none">
                    {layer.name}
                  </div>
                  <div className="relative h-full">
                    {layer.items.length > 0 ? (
                      layer.items.map((item) => {
                        const isSelected =
                          selectedItem?.layerId === layer.id &&
                          selectedItem?.itemId === item.id;
                        const timelineWidth =
                          timelineRef.current?.clientWidth || 0;
                        const paddingTime =
                          (CLIP_PADDING * 2 * TIMELINE_DURATION) /
                          timelineWidth;

                        // Check if item.content is a valid URL before rendering thumbnails/waveforms
                        const hasContent = !!(
                          item.content &&
                          typeof item.content === "string" &&
                          item.content.trim() !== "" &&
                          item.content !== "null" &&
                          item.content !== "undefined"
                        );

                        return (
                          <div
                            key={item.id}
                            className={`absolute top-1 bottom-1 rounded overflow-hidden cursor-move group
                          ${
                            isSelected
                              ? "ring-2 ring-blue-500 ring-offset-1"
                              : ""
                          }`}
                            style={{
                              left: `${
                                ((item.startTime + paddingTime / 2) /
                                  TIMELINE_DURATION) *
                                100
                              }%`,
                              width: `calc(${
                                (item.duration / TIMELINE_DURATION) * 100
                              }% - ${CLIP_PADDING * 2}px)`,
                            }}
                            onClick={(e) =>
                              handleItemClick(e, layer.id, item.id)
                            }
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData(
                                "text/plain",
                                JSON.stringify({
                                  layerId: layer.id,
                                  itemId: item.id,
                                })
                              );
                            }}
                          >
                            {layer.type === "video" && hasContent ? (
                              <VideoThumbnail
                                src={item.content!}
                                duration={item.duration}
                                className="w-full h-full"
                              />
                            ) : layer.type === "voiceover" && hasContent ? (
                              <div className="w-full h-full bg-green-500/10 border border-green-500/30 rounded p-1">
                                <AudioWaveform
                                  src={item.content!}
                                  className="w-full h-full"
                                  color="bg-green-500"
                                  duration={item.duration}
                                />
                              </div>
                            ) : layer.type === "voiceover" && !hasContent ? (
                              <div className="w-full h-full flex items-center justify-center bg-gray-100 border border-gray-200 rounded p-1">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onGenerateVoiceover();
                                  }}
                                  disabled={isGeneratingVoiceover}
                                  className="bg-black/50 hover:bg-green-500 hover:text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isGeneratingVoiceover ? (
                                    <svg
                                      className="animate-spin h-4 w-4"
                                      xmlns="http://www.w3.org/2000/svg"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                    >
                                      <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                      ></circle>
                                      <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                      ></path>
                                    </svg>
                                  ) : (
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="h-4 w-4"
                                    >
                                      <path d="M9 18V5l12-2v13" />
                                      <circle cx="6" cy="18" r="3" />
                                      <circle cx="18" cy="16" r="3" />
                                    </svg>
                                  )}
                                  {isGeneratingVoiceover
                                    ? "Generating..."
                                    : "Generate voiceover with ChirpV3"}
                                </Button>
                              </div>
                            ) : layer.type === "music" && hasContent ? (
                              <div className="w-full h-full bg-green-500/10 border border-green-500/30 rounded p-1">
                                <AudioWaveform
                                  src={item.content!}
                                  className="w-full h-full"
                                  color="bg-green-500"
                                  duration={item.duration}
                                />
                              </div>
                            ) : layer.type === "music" && !hasContent ? (
                              <div className="w-full h-full flex items-center justify-center bg-gray-100 border border-gray-200 rounded p-1">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onGenerateMusic();
                                  }}
                                  disabled={isGeneratingMusic}
                                  className="bg-black/50 hover:bg-green-500 hover:text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isGeneratingMusic ? (
                                    <svg
                                      className="animate-spin h-4 w-4"
                                      xmlns="http://www.w3.org/2000/svg"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                    >
                                      <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                      ></circle>
                                      <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                      ></path>
                                    </svg>
                                  ) : (
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="h-4 w-4"
                                    >
                                      <path d="M9 18V5l12-2v13" />
                                      <circle cx="6" cy="18" r="3" />
                                      <circle cx="18" cy="16" r="3" />
                                    </svg>
                                  )}
                                  {isGeneratingMusic
                                    ? "Generating..."
                                    : "Generate music with Lyria"}
                                </Button>
                              </div>
                            ) : (
                              <div
                                className={`w-full h-full rounded ${
                                  layer.type === "video"
                                    ? "bg-blue-500/20 border border-blue-500"
                                    : "bg-gray-300/20 border border-gray-400"
                                }`}
                              />
                            )}

                            {/* Resize handles */}
                            {isSelected && (
                              <>
                                <div
                                  className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500/50"
                                  onMouseDown={(e) =>
                                    handleResizeStart(
                                      e,
                                      layer.id,
                                      item.id,
                                      "start"
                                    )
                                  }
                                />
                                <div
                                  className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500/50"
                                  onMouseDown={(e) =>
                                    handleResizeStart(
                                      e,
                                      layer.id,
                                      item.id,
                                      "end"
                                    )
                                  }
                                />
                              </>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      // Show generate button when layer is empty
                      <div className="w-full h-full flex items-center justify-center bg-gray-100 border border-gray-200 rounded p-1">
                        {layer.type === "voiceover" ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onGenerateVoiceover();
                            }}
                            disabled={isGeneratingVoiceover}
                            className="bg-black/50 hover:bg-green-500 hover:text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isGeneratingVoiceover ? (
                              <svg
                                className="animate-spin h-4 w-4"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                ></circle>
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                              </svg>
                            ) : (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-4 w-4"
                              >
                                <path d="M9 18V5l12-2v13" />
                                <circle cx="6" cy="18" r="3" />
                                <circle cx="18" cy="16" r="3" />
                              </svg>
                            )}
                            {isGeneratingVoiceover
                              ? "Generating..."
                              : "Generate voiceover with ChirpV3"}
                          </Button>
                        ) : layer.type === "music" ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onGenerateMusic();
                            }}
                            disabled={isGeneratingMusic}
                            className="bg-black/50 hover:bg-green-500 hover:text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isGeneratingMusic ? (
                              <svg
                                className="animate-spin h-4 w-4"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                ></circle>
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                              </svg>
                            ) : (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-4 w-4"
                              >
                                <path d="M9 18V5l12-2v13" />
                                <circle cx="6" cy="18" r="3" />
                                <circle cx="18" cy="16" r="3" />
                              </svg>
                            )}
                            {isGeneratingMusic
                              ? "Generating..."
                              : "Generate music with Lyria"}
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
