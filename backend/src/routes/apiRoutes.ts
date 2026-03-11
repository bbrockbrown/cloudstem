import { Router } from "express";
import {
  uploadMiddleware,
  handleAudioUpload,
} from "../controllers/uploadController.js";
import { getJobStatus } from "../controllers/statusController.js";

const router = Router();

// process incoming form-data before passing to handleAudioUpload
router.post("/upload", uploadMiddleware, handleAudioUpload);
// check status of a specific song/job
router.get("/status/:trackingId", getJobStatus);

export default router;
