"use client";

import { useEffect, useState } from "react";

interface JobMessage {
  trackingId: string;
  status: "Processing" | "Complete" | "Failed";
  originalFileName: string;
  createdAt: string;
  currentStep?: string;
  errorMessage?: string;
  mp3Url?: string;
  waveformUrl?: string;
  encryptedUrl?: string;
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
    encryptedUrl: string,
  ) => void;
  onError: (message: string) => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const WS_URL = API_URL.replace(/^http/, "ws");

const STEP_LABELS: Record<string, string> = {
  "Downloading from S3...": "Downloading",
  "Transcoding to MP3...": "Transcoding",
  "Generating waveform...": "Waveform",
  "Encrypting original...": "Encrypting",
  "Uploading to S3...": "Uploading",
};

const ALL_STEPS = [
  "Downloading from S3...",
  "Transcoding to MP3...",
  "Generating waveform...",
  "Encrypting original...",
  "Uploading to S3...",
];

export default function ProcessingStatus({
  trackingId,
  originalFileName,
  onComplete,
  onError,
}: Props) {
  const [currentStep, setCurrentStep] = useState<string | undefined>();

  useEffect(() => {
    let ws: WebSocket | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const handleData = async (data: JobMessage & { error?: string }) => {
      if ("error" in data && data.error) {
        if (!closed) onError(data.error as string);
        return;
      }
      if (data.currentStep) setCurrentStep(data.currentStep);
      if (data.status === "Complete" && data.mp3Url && data.waveformUrl) {
        const waveformRes = await fetch(data.waveformUrl);
        const waveformData = (await waveformRes.json()) as WaveformData;
        if (!closed)
          onComplete(
            data.mp3Url,
            waveformData.points,
            trackingId,
            originalFileName,
            data.encryptedUrl ?? "",
          );
      }
      if (data.status === "Failed") {
        if (!closed) onError(data.errorMessage ?? "Processing failed");
      }
    };

    const poll = async () => {
      if (closed) return;
      try {
        const res = await fetch(`${API_URL}/api/status/${trackingId}`);
        if (res.ok) {
          const data = (await res.json()) as JobMessage;
          await handleData(data);
          if (data.status === "Processing")
            pollTimer = setTimeout(poll, 2000);
        } else {
          pollTimer = setTimeout(poll, 2000);
        }
      } catch {
        if (!closed) pollTimer = setTimeout(poll, 2000);
      }
    };

    // try WebSocket; fall back to polling on any error
    try {
      ws = new WebSocket(`${WS_URL}/api/ws/${trackingId}`);
      ws.onmessage = async (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data as string) as JobMessage & {
            error?: string;
          };
          await handleData(data);
        } catch {
          // ignore malformed messages
        }
      };
      ws.onerror = () => {
        ws?.close();
        ws = null;
        if (!closed) pollTimer = setTimeout(poll, 0);
      };
    } catch {
      // WS URL invalid (e.g. empty string on HTTPS) — go straight to polling
      pollTimer = setTimeout(poll, 0);
    }

    return () => {
      closed = true;
      ws?.close();
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [trackingId, originalFileName, onComplete, onError]);

  const completedSteps = currentStep
    ? ALL_STEPS.slice(0, ALL_STEPS.indexOf(currentStep))
    : [];
  const activeStep = currentStep;

  return (
    <div className="text-center">
      <div className="relative w-16 h-16 mx-auto mb-6">
        <div className="w-16 h-16 border-2 border-zinc-800 rounded-full" />
        <div className="absolute inset-0 w-16 h-16 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>

      <p className="text-zinc-200 font-medium mb-1">Processing your file</p>
      <p className="text-zinc-500 text-sm mb-6">{originalFileName}</p>

      {/* live step progress */}
      <div className="flex items-center justify-center gap-2 flex-wrap mb-6">
        {ALL_STEPS.map((step) => {
          const isDone = completedSteps.includes(step);
          const isActive = activeStep === step;
          return (
            <span
              key={step}
              className={[
                "text-xs px-2.5 py-1 rounded-full border transition-all duration-300",
                isDone
                  ? "bg-purple-900/40 border-purple-600/40 text-purple-300"
                  : isActive
                    ? "bg-purple-600/20 border-purple-500/60 text-purple-200 animate-pulse"
                    : "bg-zinc-900 border-zinc-800 text-zinc-600",
              ].join(" ")}
            >
              {isDone && <span className="mr-1">✓</span>}
              {STEP_LABELS[step] ?? step}
            </span>
          );
        })}
      </div>

      <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2">
        <span className="text-zinc-500 text-xs">Tracking ID</span>
        <code className="text-zinc-300 text-xs font-mono">{trackingId}</code>
      </div>
    </div>
  );
}
