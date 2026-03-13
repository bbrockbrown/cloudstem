"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Props {
  mp3Url: string;
  waveformPoints: number[];
  originalFileName: string;
  trackingId: string;
  encryptedUrl: string;
}

export default function AudioPlayer({
  mp3Url,
  waveformPoints,
  originalFileName,
  trackingId,
  encryptedUrl,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const freqCanvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // decrypt panel state
  const [hexKey, setHexKey] = useState("");
  const [decryptStatus, setDecryptStatus] = useState<
    "idle" | "working" | "error"
  >("idle");
  const [decryptError, setDecryptError] = useState("");

  // waveform canvas from S3
  const drawWaveform = useCallback(
    (currentProgress: number) => {
      const canvas = waveCanvasRef.current;
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

      const minVal = Math.min(...waveformPoints);
      const maxVal = Math.max(...waveformPoints, 0.001);
      const range = maxVal - minVal || 0.001;
      const shaped = waveformPoints.map((v) =>
        Math.pow((v - minVal) / range, 0.7),
      );

      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = "#3f3f46";
      shaped.forEach((amplitude, i) => {
        const barHeight = Math.max(2, amplitude * height * 0.9);
        const x = i * barWidth;
        const y = (height - barHeight) / 2;
        ctx.fillRect(x + 0.5, y, Math.max(barWidth - 1, 1), barHeight);
      });

      if (currentProgress > 0) {
        const playheadX = currentProgress * width;
        const grad = ctx.createLinearGradient(0, 0, width, 0);
        grad.addColorStop(0, "#7c3aed");
        grad.addColorStop(0.4, "#a855f7");
        grad.addColorStop(0.75, "#d946ef");
        grad.addColorStop(1, "#ec4899");

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

        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillRect(playheadX - 1, 0, 2, height);
      }
    },
    [waveformPoints],
  );

  useEffect(() => {
    drawWaveform(progress);
  }, [drawWaveform, progress]);

  // freqeuncy visualizer
  const drawFrequency = useCallback(() => {
    const analyser = analyserRef.current;
    const canvas = freqCanvasRef.current;
    if (!analyser || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio ?? 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    }

    const width = rect.width;
    const height = rect.height;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, width, height);

    const grad = ctx.createLinearGradient(0, 0, width, 0);
    grad.addColorStop(0, "#7c3aed");
    grad.addColorStop(0.4, "#a855f7");
    grad.addColorStop(0.75, "#d946ef");
    grad.addColorStop(1, "#ec4899");

    const barCount = 80;
    const barWidth = width / barCount - 1;
    const step = Math.floor(bufferLength / barCount);

    for (let i = 0; i < barCount; i++) {
      const value = dataArray[i * step] / 255;
      const barHeight = Math.max(2, value * height * 0.9);
      const x = i * (barWidth + 1);
      const y = height - barHeight;
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, barWidth, barHeight);
    }

    animFrameRef.current = requestAnimationFrame(drawFrequency);
  }, []);

  const setupWebAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audioCtxRef.current) return;

    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analyser.connect(ctx.destination);

    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
  }, []);

  useEffect(() => {
    if (isPlaying) {
      setupWebAudio();
      if (audioCtxRef.current?.state === "suspended") {
        audioCtxRef.current.resume();
      }
      animFrameRef.current = requestAnimationFrame(drawFrequency);
    } else {
      cancelAnimationFrame(animFrameRef.current);
      // clear freq canvas when paused
      const canvas = freqCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, drawFrequency, setupWebAudio]);

  // audio event handlers
  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setProgress(audio.currentTime / audio.duration);
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
      const canvas = waveCanvasRef.current;
      const audio = audioRef.current;
      if (!canvas || !audio || !audio.duration) return;
      const rect = canvas.getBoundingClientRect();
      const newProgress = (e.clientX - rect.left) / rect.width;
      audio.currentTime = newProgress * audio.duration;
      setProgress(newProgress);
    },
    [],
  );

  // fetch the mp3 blob then create link to download it
  const handleDownloadMp3 = useCallback(async () => {
    const res = await fetch(mp3Url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = originalFileName.replace(/\.[^.]+$/, "") + ".mp3";
    a.click();
    URL.revokeObjectURL(blobUrl);
  }, [mp3Url, originalFileName]);

  // decryption method for fetching original file
  const handleDecryptDownload = useCallback(async () => {
    setDecryptStatus("working");
    setDecryptError("");

    try {
      const keyBytes = hexKey.match(/.{2}/g)?.map((b) => parseInt(b, 16));
      if (!keyBytes || keyBytes.length !== 32) {
        throw new Error("Key must be a 64-character hex string (32 bytes).");
      }

      const encRes = await fetch(encryptedUrl);
      if (!encRes.ok)
        throw new Error("Failed to fetch encrypted file from S3.");
      const encBuffer = await encRes.arrayBuffer();

      // first 16 bytes are the IV, remainder is ciphertext
      const iv = encBuffer.slice(0, 16);
      const ciphertext = encBuffer.slice(16);

      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        new Uint8Array(keyBytes),
        { name: "AES-CBC" },
        false,
        ["decrypt"],
      );

      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-CBC", iv },
        cryptoKey,
        ciphertext,
      );

      const blob = new Blob([plaintext], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = originalFileName.replace(/\.[^.]+$/, "") + "-master.wav";
      a.click();
      URL.revokeObjectURL(url);

      setDecryptStatus("idle");
    } catch (err) {
      setDecryptError(
        err instanceof Error ? err.message : "Decryption failed.",
      );
      setDecryptStatus("error");
    }
  }, [hexKey, encryptedUrl, originalFileName]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const baseName = originalFileName.replace(/\.[^.]+$/, "");

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
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

      {/* waveform canvas */}
      <canvas
        ref={waveCanvasRef}
        className="w-full h-32 cursor-pointer rounded-lg mb-2"
        onClick={handleCanvasClick}
      />

      {/* time display */}
      <div className="flex justify-between text-xs text-zinc-500 mb-5">
        <span>{formatTime(currentTime)}</span>
        <span>{duration ? formatTime(duration) : "--:--"}</span>
      </div>

      {/* frequency visualizer (only rendered while playing) */}
      <div
        className={[
          "overflow-hidden transition-all duration-300",
          isPlaying ? "h-16 mb-4 opacity-100" : "h-0 opacity-0",
        ].join(" ")}
      >
        <canvas ref={freqCanvasRef} className="w-full h-16 rounded-lg" />
      </div>

      {/* playback controls */}
      <div className="flex items-center justify-center gap-4">
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

        {/* MP3 download */}
        <button
          onClick={handleDownloadMp3}
          title="Download MP3"
          className="w-9 h-9 rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors flex items-center justify-center"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 1v8M4 6l3 3 3-3M2 11h10"
              stroke="#a1a1aa"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* job details */}
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

      {/* decrypt & Download original WAV */}
      {encryptedUrl && (
        <div className="mt-4 pt-4 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 mb-2 font-medium">
            Decrypt &amp; Download Original WAV
          </p>
          <p className="text-xs text-zinc-600 mb-3">
            Enter the 64-character hex encryption key to decrypt the master file
            in-browser using AES-256-CBC.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={hexKey}
              onChange={(e) => setHexKey(e.target.value.trim())}
              placeholder="64-char hex key..."
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={handleDecryptDownload}
              disabled={decryptStatus === "working" || hexKey.length !== 64}
              className="shrink-0 px-3 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
            >
              {decryptStatus === "working" ? "Decrypting…" : "Decrypt"}
            </button>
          </div>
          {decryptStatus === "error" && (
            <p className="text-red-400 text-xs mt-2">{decryptError}</p>
          )}
        </div>
      )}

      {/* hidden audio element */}
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
