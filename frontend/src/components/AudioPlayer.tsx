"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Props {
  mp3Url: string;
  waveformPoints: number[];
  originalFileName: string;
  trackingId: string;
}

export default function AudioPlayer({
  mp3Url,
  waveformPoints,
  originalFileName,
  trackingId,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const drawWaveform = useCallback(
    (currentProgress: number) => {
      const canvas = canvasRef.current;
      if (!canvas || waveformPoints.length === 0) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio ?? 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const width = rect.width;
      const height = rect.height;
      const barWidth = width / waveformPoints.length;

      // Range stretch: map [min, max] → [0, 1] to exaggerate existing variation,
      // then apply a power curve to further boost separation between quiet/loud bars.
      const minVal = Math.min(...waveformPoints);
      const maxVal = Math.max(...waveformPoints, 0.001);
      const range = maxVal - minVal || 0.001;
      const shaped = waveformPoints.map((v) =>
        Math.pow((v - minVal) / range, 0.7),
      );

      ctx.clearRect(0, 0, width, height);

      // Pass 1: draw all bars in dark gray (unplayed state)
      ctx.fillStyle = "#3f3f46";
      shaped.forEach((amplitude, i) => {
        const barHeight = Math.max(2, amplitude * height * 0.9);
        const x = i * barWidth;
        const y = (height - barHeight) / 2;
        ctx.fillRect(x + 0.5, y, Math.max(barWidth - 1, 1), barHeight);
      });

      // Pass 2: redraw played portion with a violet→fuchsia→pink gradient
      if (currentProgress > 0) {
        const playheadX = currentProgress * width;
        const grad = ctx.createLinearGradient(0, 0, width, 0);
        grad.addColorStop(0, "#7c3aed");   // violet-700
        grad.addColorStop(0.4, "#a855f7"); // purple-500
        grad.addColorStop(0.75, "#d946ef"); // fuchsia-500
        grad.addColorStop(1, "#ec4899");   // pink-500

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, playheadX, height);
        ctx.clip();
        ctx.fillStyle = grad;
        shaped.forEach((amplitude, i) => {
          const barHeight = Math.max(2, amplitude * height * 0.9);
          const x = i * barWidth;
          const y = (height - barHeight) / 2;
          ctx.fillRect(x + 0.5, y, Math.max(barWidth - 1, 1), barHeight);
        });
        ctx.restore();

        // Playhead
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillRect(playheadX - 1, 0, 2, height);
      }
    },
    [waveformPoints],
  );

  useEffect(() => {
    drawWaveform(progress);
  }, [drawWaveform, progress]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const p = audio.currentTime / audio.duration;
    setProgress(p);
    setCurrentTime(audio.currentTime);
  }, []);

  const handleDurationChange = useCallback(() => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime(0);
  }, []);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      await audio.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const audio = audioRef.current;
      if (!canvas || !audio || !audio.duration) return;
      const rect = canvas.getBoundingClientRect();
      const newProgress = (e.clientX - rect.left) / rect.width;
      audio.currentTime = newProgress * audio.duration;
      setProgress(newProgress);
    },
    [],
  );

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const baseName = originalFileName.replace(/\.[^.]+$/, "");

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
      {/* File info */}
      <div className="flex items-start justify-between mb-6">
        <div className="min-w-0 flex-1 mr-4">
          <p className="font-semibold text-zinc-100 truncate">{baseName}</p>
          <p className="text-zinc-500 text-sm mt-0.5 truncate">
            {originalFileName}
          </p>
        </div>
        <div className="shrink-0 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1">
          <span className="text-green-400 text-xs font-medium">Complete</span>
        </div>
      </div>

      {/* Waveform canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-32 cursor-pointer rounded-lg mb-2"
        onClick={handleCanvasClick}
      />

      {/* Time display */}
      <div className="flex justify-between text-xs text-zinc-500 mb-5">
        <span>{formatTime(currentTime)}</span>
        <span>{duration ? formatTime(duration) : "--:--"}</span>
      </div>

      {/* Play/pause button */}
      <div className="flex items-center justify-center">
        <button
          onClick={togglePlay}
          className="w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-500 transition-colors flex items-center justify-center"
        >
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="2" width="4" height="12" rx="1" fill="white" />
              <rect x="9" y="2" width="4" height="12" rx="1" fill="white" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 2l10 6-10 6V2z" fill="white" />
            </svg>
          )}
        </button>
      </div>

      {/* Job details */}
      <div className="mt-6 pt-4 border-t border-zinc-800 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-600">Tracking ID</span>
          <code className="text-zinc-400 font-mono">{trackingId}</code>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-600">Format</span>
          <span className="text-zinc-400">MP3 · 320 kbps</span>
        </div>
      </div>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={mp3Url}
        onTimeUpdate={handleTimeUpdate}
        onDurationChange={handleDurationChange}
        onEnded={handleEnded}
        crossOrigin="anonymous"
      />
    </div>
  );
}
