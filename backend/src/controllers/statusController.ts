import type { Request, Response } from "express";
import { getJob } from "../services/dynamoService.js";
import { getPresignedUrl } from "../services/s3Service.js";
import { asyncHandler } from "../util/asyncWrapper.js";

export const getJobStatus = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const trackingId = req.params["trackingId"] as string;

    if (!trackingId) {
      res.status(400).json({ error: "Missing trackingId" });
      return;
    }

    const job = await getJob(trackingId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    if (job.status === "Complete" && job.mp3Key && job.waveformKey && job.encryptedKey) {
      const [mp3Url, waveformUrl, encryptedUrl] = await Promise.all([
        getPresignedUrl(job.mp3Key),
        getPresignedUrl(job.waveformKey),
        getPresignedUrl(job.encryptedKey),
      ]);
      res.status(200).json({ ...job, mp3Url, waveformUrl, encryptedUrl });
      return;
    }

    res.status(200).json(job);
  },
);
