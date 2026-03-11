export type JobStatus = "Processing" | "Complete" | "Failed";

export interface JobRecord {
  trackingId: string;
  originalFileName: string;
  status: JobStatus;
  createdAt: string;
  updatedAt?: string;
  mp3Key?: string;
  waveformKey?: string;
  encryptedKey?: string;
  errorMessage?: string;
}
