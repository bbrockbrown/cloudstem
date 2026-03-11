import type { Request, Response } from "express";
import { getJob } from "../services/dynamoService.js";
import { getPresignedUrl } from "../services/s3Service.js";

export const getJobStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  // extract trackingId from request
  const trackingId = req.params['trackingId'] as string;

  // ensure we have trackindId
  if (!trackingId) {
    res.status(400).json({ error: "Missing trackingId" });
    return;
  }

  // get the job
  const job = await getJob(trackingId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  // if the job is complete and we have both keys, then return
  // they keys in addition to job
  if (job.status === "Complete" && job.mp3Key && job.waveformKey) {
    const [mp3Url, waveformUrl] = await Promise.all([
      getPresignedUrl(job.mp3Key),
      getPresignedUrl(job.waveformKey),
    ]);
    res.status(200).json({ ...job, mp3Url, waveformUrl });
    return;
  }

  // send the job
  res.status(200).json(job);
};
