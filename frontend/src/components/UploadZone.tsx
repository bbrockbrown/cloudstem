"use client";

import { useCallback, useState, useRef } from "react";

interface Props {
  onFileSelected: (file: File) => void;
}

export default function UploadZone({ onFileSelected }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSubmit = useCallback(
    (file: File) => {
      setError(null);
      const ext = file.name.toLowerCase().split(".").pop();
      if (ext !== "wav") {
        setError("Only .wav files are supported.");
        return;
      }
      onFileSelected(file);
    },
    [onFileSelected],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) validateAndSubmit(file);
    },
    [validateAndSubmit],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validateAndSubmit(file);
    },
    [validateAndSubmit],
  );

  return (
    <div className="text-center">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">
        Cloud Audio Processing
      </h1>
      <p className="text-zinc-400 mb-10 text-base">
        Upload a WAV stem file to transcode, visualize, and archive it.
      </p>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-2xl p-16 cursor-pointer
          transition-all duration-200
          ${
            isDragging
              ? "border-purple-500 bg-purple-500/5"
              : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-900/50"
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".wav,audio/wav,audio/x-wav"
          className="sr-only"
          onChange={handleInputChange}
        />
        <div className="flex flex-col items-center gap-4">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
              isDragging ? "bg-purple-500/20" : "bg-zinc-800"
            }`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 16V8M12 8l-3 3M12 8l3 3"
                stroke={isDragging ? "#a855f7" : "#71717a"}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M3 16v1a4 4 0 004 4h10a4 4 0 004-4v-1"
                stroke={isDragging ? "#a855f7" : "#71717a"}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div>
            <p className="font-medium text-zinc-200">
              {isDragging ? "Drop it!" : "Drop your WAV file here"}
            </p>
            <p className="text-zinc-500 text-sm mt-1">or click to browse</p>
          </div>
          <p className="text-zinc-600 text-xs">
            WAV files only &bull; up to 2 GB
          </p>
        </div>
      </div>

      {error && <p className="mt-4 text-red-400 text-sm">{error}</p>}
    </div>
  );
}
