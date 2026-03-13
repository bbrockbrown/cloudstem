import type { Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { queueAudioForProcessing } from "../services/sqsService.js";
import { createJob } from "../services/dynamoService.js";
import { uploadFileToS3 } from "../services/s3Service.js";
import { asyncHandler } from "../util/asyncWrapper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tempUploadDir = path.join(__dirname, "../../uploads/temp");
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, tempUploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}${ext}`);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (file.mimetype.startsWith("audio/")) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only audio files allowed."));
  }
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024,
  },
}).single("audioFile");

export const handleAudioUpload = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No audio file provided." });
      return;
    }

    const localPath = req.file.path;
    const originalName = req.file.originalname;
    const trackingId = req.file.filename;
    const s3RawKey = `raw/${trackingId}`;

    // upload the raw file to S3 so the worker can access it from any machine
    await uploadFileToS3(localPath, s3RawKey, req.file.mimetype || "audio/wav");

    // clean up the local temp file immediately after S3 upload
    try {
      fs.unlinkSync(localPath);
    } catch {
      // temp directory will be cleaned up eventually
    }

    // write initial processing record to DynamoDB
    await createJob(trackingId, originalName);

    // queue for background processing with the S3 key
    await queueAudioForProcessing(trackingId, originalName, s3RawKey);

    res.status(202).json({
      message: "File uploaded successfully. Processing initiated.",
      fileName: originalName,
      trackingId,
    });
  },
);
