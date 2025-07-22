import { useEffect, useRef, useState } from "react";
import { getAudioUrl } from "@/lib/mediaProxy";

interface AudioWaveformProps {
  src: string;
  className?: string;
  color?: string;
  duration: number;
}

export function AudioWaveform({
  src,
  className,
  color = "bg-green-500",
  duration,
}: AudioWaveformProps) {
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    const analyzeAudio = async () => {
      // Don't analyze if src is empty, undefined, null, or invalid
      if (
        !src ||
        typeof src !== "string" ||
        src.trim() === "" ||
        src === "null" ||
        src === "undefined"
      ) {
        setWaveformData([]);
        return;
      }
      try {
        // Create audio context and analyzer
        audioContextRef.current = new AudioContext();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256; // Adjust for desired detail level

        // Fetch and decode audio using proxy if needed
        const fetchUrl = getAudioUrl(src);
        const response = await fetch(fetchUrl);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch audio: ${response.status} ${response.statusText}`
          );
        }
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContextRef.current.decodeAudioData(
          arrayBuffer
        );

        // Calculate number of bars based on duration (10 bars per second)
        const samples = Math.max(10, Math.floor(duration * 10)); // At least 10 bars, then 10 per second
        const blockSize = Math.floor(audioBuffer.length / samples);
        const waveform: number[] = [];

        // Get waveform data
        const channelData = audioBuffer.getChannelData(0);
        for (let i = 0; i < samples; i++) {
          const start = blockSize * i;
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(channelData[start + j]);
          }
          waveform.push(sum / blockSize);
        }

        // Normalize waveform data
        const max = Math.max(...waveform);
        const normalizedWaveform = waveform.map((value) => value / max);
        setWaveformData(normalizedWaveform);
      } catch (error) {
        console.error("Error analyzing audio:", error);
        // Fallback to a simple waveform if analysis fails
        setWaveformData(
          Array(Math.max(10, Math.floor(duration * 10))).fill(0.5)
        );
      }
    };

    analyzeAudio();

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [src, duration]);

  return (
    <div className={`${className} flex items-center gap-px`}>
      {waveformData.map((height, index) => (
        <div
          key={index}
          className={`${color} w-full transition-all duration-100`}
          style={{
            height: `${Math.max(20, height * 100)}%`,
            opacity: 0.7,
          }}
        />
      ))}
    </div>
  );
}
