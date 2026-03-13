import {
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import { sqsClient } from "../config/aws.js";
import {
  uploadFileToS3,
  uploadBufferToS3,
  downloadFileFromS3,
} from "./s3Service.js";
import {
  markJobCompleted,
  markJobFailed,
  updateJobStep,
} from "./dynamoService.js";
import ffmpeg from "fluent-ffmpeg";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";
import * as dotenv from "dotenv";

dotenv.config();

const QUEUE_URL = process.env.SQS_QUEUE_URL;
if (!QUEUE_URL) throw new Error("SQS_QUEUE_URL not set in .env");

const ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY_HEX) throw new Error("ENCRYPTION_KEY not set in .env");

interface SQSPayload {
  trackingId: string;
  originalFileName: string;
  s3RawKey: string;
  timestamp: string;
}

const transcodeToMp3 = (inputPath: string, outputPath: string): Promise<void> =>
  new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat("mp3")
      .audioCodec("libmp3lame")
      .audioBitrate(320)
      .on("end", () => resolve())
      .on("error", reject)
      .save(outputPath);
  });

const generateWaveform = (
  inputPath: string,
  numPoints = 300,
): Promise<number[]> =>
  new Promise((resolve, reject) => {
    const pcmPath = inputPath + ".pcm";
    ffmpeg(inputPath)
      .toFormat("s16le")
      .audioChannels(1)
      .audioFrequency(22050)
      .on("end", () => {
        try {
          const buf = fs.readFileSync(pcmPath);
          fs.unlinkSync(pcmPath);
          const totalSamples = Math.floor(buf.byteLength / 2);
          const blockSize = Math.max(1, Math.floor(totalSamples / numPoints));
          const waveform: number[] = [];
          for (let i = 0; i < numPoints; i++) {
            let peak = 0;
            for (let j = 0; j < blockSize; j++) {
              const offset = (i * blockSize + j) * 2;
              if (offset + 1 < buf.byteLength) {
                const sample = Math.abs(buf.readInt16LE(offset));
                if (sample > peak) peak = sample;
              }
            }
            waveform.push(peak / 32768);
          }
          resolve(waveform);
        } catch (err) {
          reject(err);
        }
      })
      .on("error", reject)
      .save(pcmPath);
  });

const encryptFile = (inputPath: string, outputPath: string): void => {
  const key = Buffer.from(ENCRYPTION_KEY_HEX, "hex");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const plaintext = fs.readFileSync(inputPath);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  fs.writeFileSync(outputPath, Buffer.concat([iv, encrypted]));
};

const cleanUp = (...paths: string[]): void => {
  for (const p of paths) {
    try {
      fs.unlinkSync(p);
    } catch {
      // ignore missing files
    }
  }
};

const processJob = async (payload: SQSPayload): Promise<void> => {
  const { trackingId, originalFileName, s3RawKey } = payload;
  const ext = path.extname(originalFileName) || ".wav";
  const workDir = path.join(os.tmpdir(), `cloudstem-${trackingId}`);
  fs.mkdirSync(workDir, { recursive: true });

  const rawPath = path.join(workDir, `input${ext}`);
  const mp3Path = path.join(workDir, `output.mp3`);
  const encPath = path.join(workDir, `output.enc`);
  const baseName = path.parse(trackingId).name;

  try {
    console.log(`[worker] Processing ${trackingId} (${originalFileName})`);

    // uplaod to s3 + update job step
    await updateJobStep(trackingId, "Downloading from S3...");
    console.log("[worker] Downloading raw file from S3...");
    await downloadFileFromS3(s3RawKey, rawPath);

    // transcode + update job step
    await updateJobStep(trackingId, "Transcoding to MP3...");
    console.log("[worker] Transcoding to MP3...");
    await transcodeToMp3(rawPath, mp3Path);

    // generate waveform + update job step
    await updateJobStep(trackingId, "Generating waveform...");
    console.log("[worker] Generating waveform...");
    const waveformPoints = await generateWaveform(rawPath);
    const waveformBuffer = Buffer.from(
      JSON.stringify({ points: waveformPoints }),
    );

    // encrypt master/.wav + update job step
    await updateJobStep(trackingId, "Encrypting original...");
    console.log("[worker] Encrypting original...");
    encryptFile(rawPath, encPath);

    const mp3Key = `transcoded/${baseName}.mp3`;
    const waveformKey = `waveforms/${baseName}.json`;
    const encryptedKey = `encrypted/${baseName}.enc`;

    // upload transcoded, waveform, and encrypted to s3 + update job step
    await updateJobStep(trackingId, "Uploading to S3...");
    console.log("[worker] Uploading to S3...");
    await Promise.all([
      uploadFileToS3(mp3Path, mp3Key, "audio/mpeg"),
      uploadBufferToS3(waveformBuffer, waveformKey, "application/json"),
      uploadFileToS3(encPath, encryptedKey, "application/octet-stream"),
    ]);

    // completed job
    await markJobCompleted(trackingId, mp3Key, waveformKey, encryptedKey);
    console.log(`[worker] Job ${trackingId} completed.`);

    cleanUp(rawPath, mp3Path, encPath);
    try {
      fs.rmdirSync(workDir);
    } catch {
      /* ignore */
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Job ${trackingId} failed:`, msg);
    await markJobFailed(trackingId, msg);
    cleanUp(mp3Path, encPath);
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    throw err;
  }
};

const poll = async (): Promise<void> => {
  console.log("[worker] SQS poller started.");
  while (true) {
    try {
      const result = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: QUEUE_URL,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 20,
        }),
      );

      if (!result.Messages?.length) continue;

      for (const message of result.Messages) {
        if (!message.Body || !message.ReceiptHandle) continue;

        let payload: SQSPayload;
        try {
          payload = JSON.parse(message.Body) as SQSPayload;
        } catch {
          console.error("[worker] Unparseable message, discarding.");
          await sqsClient.send(
            new DeleteMessageCommand({
              QueueUrl: QUEUE_URL,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );
          continue;
        }

        try {
          await processJob(payload);
        } catch {
          // error already logged and DynamoDB updated inside processJob
        }

        // always delete from queue (success or failure) to prevent infinite retries
        await sqsClient.send(
          new DeleteMessageCommand({
            QueueUrl: QUEUE_URL,
            ReceiptHandle: message.ReceiptHandle,
          }),
        );
      }
    } catch (err) {
      console.error("[worker] Poll error:", err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
};

poll();
