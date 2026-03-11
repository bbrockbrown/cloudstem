"use client";

import { useEffect } from "react";

interface StatusResponse {
  trackingId: string;
  status: "Processing" | "Complete" | "Failed";
  originalFileName: string;
  createdAt: string;
  errorMessage?: string;
  mp3Url?: string;
  waveformUrl?: string;
}

interface WaveformData {
  points: number[];
}

interface Props {
  trackingId: string;
  originalFileName: string;
  onComplete: (
    mp3Url: string,
    waveformPoints: number[],
    trackingId: string,
    originalFileName: string,
  ) => void;
  onError: (message: string) => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function ProcessingStatus({
  trackingId,
  originalFileName,
  onComplete,
  onError,
}: Props) {
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`${API_URL}/api/status/${trackingId}`);
        if (!res.ok) throw new Error("Status check failed");

        const data = (await res.json()) as StatusResponse;

        if (data.status === "Complete" && data.mp3Url && data.waveformUrl) {
          const waveformRes = await fetch(data.waveformUrl);
          const waveformData = (await waveformRes.json()) as WaveformData;
          if (!cancelled) {
            onComplete(
              data.mp3Url,
              waveformData.points,
              trackingId,
              originalFileName,
            );
          }
          return;
        }

        if (data.status === "Failed") {
          if (!cancelled) {
            onError(data.errorMessage ?? "Processing failed");
          }
          return;
        }

        // Still processing — poll again
        timeoutId = setTimeout(poll, 2000);
      } catch (err) {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : "Status check failed");
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [trackingId, originalFileName, onComplete, onError]);

  return (
    <div className="text-center">
      <div className="relative w-16 h-16 mx-auto mb-6">
        <div className="w-16 h-16 border-2 border-zinc-800 rounded-full" />
        <div className="absolute inset-0 w-16 h-16 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
      <p className="text-zinc-200 font-medium mb-1">Processing your file</p>
      <p className="text-zinc-500 text-sm mb-6">{originalFileName}</p>
      <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2">
        <span className="text-zinc-500 text-xs">Tracking ID</span>
        <code className="text-zinc-300 text-xs font-mono">{trackingId}</code>
      </div>
      <p className="text-zinc-600 text-xs mt-6">
        Transcoding · Waveform · Encryption · S3 upload
      </p>
    </div>
  );
}
