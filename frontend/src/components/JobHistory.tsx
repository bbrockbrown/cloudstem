"use client";

import { useEffect, useState } from "react";

interface JobRecord {
  trackingId: string;
  originalFileName: string;
  status: "Processing" | "Complete" | "Failed";
  createdAt: string;
  errorMessage?: string;
}

interface Props {
  onLoad: (trackingId: string, originalFileName: string) => void;
}

const PAGE_SIZE = 5;

export default function JobHistory({ onLoad }: Props) {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  useEffect(() => {
    fetch(`${API_URL}/api/history`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setJobs(Array.isArray(data) ? (data as JobRecord[]) : []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [API_URL]);

  const handleLoad = async (job: JobRecord) => {
    setLoadingId(job.trackingId);
    try {
      onLoad(job.trackingId, job.originalFileName);
    } finally {
      setLoadingId(null);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <p className="text-center text-zinc-500 text-sm py-12">No jobs found.</p>
    );
  }

  const visible = showAll ? jobs : jobs.slice(0, PAGE_SIZE);
  const hasMore = jobs.length > PAGE_SIZE;

  return (
    <div className="space-y-2">
      {visible.map((job) => {
        const baseName = job.originalFileName.replace(/\.[^.]+$/, "");
        const isComplete = job.status === "Complete";
        const isFailed = job.status === "Failed";

        return (
          <div
            key={job.trackingId}
            className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3"
          >
            {/* status dot */}
            <div
              className={[
                "shrink-0 w-2 h-2 rounded-full",
                isComplete
                  ? "bg-green-500"
                  : isFailed
                    ? "bg-red-500"
                    : "bg-yellow-500 animate-pulse",
              ].join(" ")}
            />

            {/* file info */}
            <div className="flex-1 min-w-0">
              <p className="text-zinc-200 text-sm font-medium truncate">
                {baseName}
              </p>
              <p className="text-zinc-500 text-xs mt-0.5">
                {formatDate(job.createdAt)}
                {isFailed && job.errorMessage && (
                  <span className="text-red-400 ml-2">{job.errorMessage}</span>
                )}
              </p>
            </div>

            {/* status badge */}
            <span
              className={[
                "shrink-0 text-xs px-2 py-0.5 rounded-full border",
                isComplete
                  ? "bg-green-500/10 border-green-500/20 text-green-400"
                  : isFailed
                    ? "bg-red-500/10 border-red-500/20 text-red-400"
                    : "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
              ].join(" ")}
            >
              {job.status}
            </span>

            {/* load button */}
            {isComplete && (
              <button
                onClick={() => handleLoad(job)}
                disabled={loadingId === job.trackingId}
                className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              >
                {loadingId === job.trackingId ? "Loading…" : "Load"}
              </button>
            )}
          </div>
        );
      })}
      {hasMore && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full text-xs text-zinc-500 hover:text-zinc-300 py-2 transition-colors"
        >
          {showAll ? "Show less" : `Show ${jobs.length - PAGE_SIZE} more`}
        </button>
      )}
    </div>
  );
}
