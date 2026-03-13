"use client";

import { useState, useCallback } from "react";
import UploadZone from "./UploadZone";
import ProcessingStatus from "./ProcessingStatus";
import AudioPlayer from "./AudioPlayer";
import JobHistory from "./JobHistory";

type AppState =
  | { stage: "idle" }
  | { stage: "uploading" }
  | { stage: "polling"; trackingId: string; originalFileName: string }
  | {
      stage: "complete";
      trackingId: string;
      originalFileName: string;
      mp3Url: string;
      waveformPoints: number[];
      encryptedUrl: string;
    }
  | { stage: "error"; message: string };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function CloudStemApp() {
  const [state, setState] = useState<AppState>({ stage: "idle" });
  const [showHistory, setShowHistory] = useState(false);

  const handleFileSelected = useCallback(async (file: File) => {
    setState({ stage: "uploading" });
    try {
      const formData = new FormData();
      formData.append("audioFile", file);

      const res = await fetch(`${API_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Upload failed");
      }

      const { trackingId } = (await res.json()) as { trackingId: string };
      setState({ stage: "polling", trackingId, originalFileName: file.name });
    } catch (err) {
      setState({
        stage: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }, []);

  const handleComplete = useCallback(
    (
      mp3Url: string,
      waveformPoints: number[],
      trackingId: string,
      originalFileName: string,
      encryptedUrl: string,
    ) => {
      setState({
        stage: "complete",
        mp3Url,
        waveformPoints,
        trackingId,
        originalFileName,
        encryptedUrl,
      });
    },
    [],
  );

  const handleError = useCallback((message: string) => {
    setState({ stage: "error", message });
  }, []);

  const handleReset = useCallback(() => {
    setState({ stage: "idle" });
  }, []);

  const handleLoadJob = useCallback(
    async (trackingId: string, originalFileName: string) => {
      const res = await fetch(`${API_URL}/api/status/${trackingId}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        mp3Url?: string;
        waveformUrl?: string;
        encryptedUrl?: string;
      };
      if (!data.mp3Url || !data.waveformUrl) return;
      const wfRes = await fetch(data.waveformUrl);
      const wfData = (await wfRes.json()) as { points: number[] };
      setState({
        stage: "complete",
        trackingId,
        originalFileName,
        mp3Url: data.mp3Url,
        waveformPoints: wfData.points,
        encryptedUrl: data.encryptedUrl ?? "",
      });
      setShowHistory(false);
    },
    [],
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col">
      {/* header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 1v14M4 4v8M12 4v8M1 7.5v1M15 7.5v1"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span className="font-semibold text-lg tracking-tight flex-1">
            CloudStem
          </span>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className={[
              "text-sm px-3 py-1.5 rounded-lg border transition-colors",
              showHistory
                ? "bg-purple-700 border-purple-600 text-white"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200",
            ].join(" ")}
          >
            Library
          </button>
        </div>
      </header>

      {/* main content */}
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl">
          {showHistory && (
            <div className="mb-8">
              <h2 className="text-zinc-300 font-medium mb-4">Library</h2>
              <JobHistory onLoad={handleLoadJob} />
            </div>
          )}
          {state.stage === "idle" && (
            <UploadZone onFileSelected={handleFileSelected} />
          )}

          {state.stage === "uploading" && (
            <div className="text-center">
              <div className="w-12 h-12 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-zinc-400">Uploading file...</p>
            </div>
          )}

          {state.stage === "polling" && (
            <ProcessingStatus
              trackingId={state.trackingId}
              originalFileName={state.originalFileName}
              onComplete={handleComplete}
              onError={handleError}
            />
          )}

          {state.stage === "complete" && (
            <div>
              <AudioPlayer
                mp3Url={state.mp3Url}
                waveformPoints={state.waveformPoints}
                originalFileName={state.originalFileName}
                trackingId={state.trackingId}
                encryptedUrl={state.encryptedUrl}
              />
              <button
                onClick={handleReset}
                className="mt-8 mx-auto flex items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors text-sm"
              >
                &larr; Upload another file
              </button>
            </div>
          )}

          {state.stage === "error" && (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M10 6v5M10 14h.01"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <circle
                    cx="10"
                    cy="10"
                    r="9"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                  />
                </svg>
              </div>
              <p className="text-red-400 mb-2 font-medium">Processing failed</p>
              <p className="text-zinc-500 text-sm mb-6">{state.message}</p>
              <button
                onClick={handleReset}
                className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
