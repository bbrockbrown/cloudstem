import type { Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { queueAudioForProcessing } from "../services/sqsService.js";
import { createJob } from "../services/dynamoService.js";

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

export const handleAudioUpload = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    // ensure there's actually a file in the request
    if (!req.file) {
      res.status(400).json({ error: "No audio file provided." });
      return;
    }

    // extract fiel info
    const uploadedFilePath = req.file.path;
    const originalName = req.file.originalname;
    const trackingId = req.file.filename;

    // write initial processing record to dynamo
    await createJob(trackingId, originalName);

    // queue for background processing
    await queueAudioForProcessing(trackingId, originalName, uploadedFilePath);

    res.status(202).json({
      message: "File uploaded successfully. Processing initiated.",
      fileName: originalName,
      trackingId,
    });
  } catch (err) {
    console.error("Error handling upload:", err);
    res.status(500).json({ error: "Internal server error during upload" });
  }
};
