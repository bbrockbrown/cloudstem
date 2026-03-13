import type { Request, Response } from "express";
import { listJobs } from "../services/dynamoService.js";
import { asyncHandler } from "../util/asyncWrapper.js";

export const getJobHistory = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const jobs = await listJobs();
    res.status(200).json(jobs);
  },
);
