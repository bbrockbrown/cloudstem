import {
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import { sqsClient } from "../config/aws.js";
import { uploadFileToS3, uploadBufferToS3 } from "./s3Service.js";
import { markJobCompleted, markJobFailed } from "./dynamoService.js";
import ffmpeg from "fluent-ffmpeg";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";

dotenv.config();

const QUEUE_URL = process.env.SQS_QUEUE_URL;
if (!QUEUE_URL) throw new Error("SQS_QUEUE_URL not set in .env");

const ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY_HEX) throw new Error("ENCRYPTION_KEY not set in .env");

interface SQSPayload {
  trackingId: string;
  originalFileName: string;
  localFilePath: string;
  timestamp: string;
}

// transcode .wav -> .mp3 at 320kbps for now
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

// convert to raw 16-bit PCM, sample N amplitude points for waveform visualization
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
            waveform.push(peak / 32768); // normalize to 0–1
          }
          resolve(waveform);
        } catch (err) {
          reject(err);
        }
      })
      .on("error", reject)
      .save(pcmPath);
  });

// encrypt the file IV is prepended to the output file
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
  const { trackingId, originalFileName, localFilePath } = payload;
  const baseName = path.parse(trackingId).name; // UUID without extension
  const dir = path.dirname(localFilePath);
  const mp3Path = path.join(dir, `${baseName}.mp3`);
  const encPath = path.join(dir, `${baseName}.enc`);

  try {
    console.log(`[worker] Processing ${trackingId} (${originalFileName})`);

    console.log("[worker] Transcoding to MP3...");
    await transcodeToMp3(localFilePath, mp3Path);

    console.log("[worker] Generating waveform...");
    const waveformPoints = await generateWaveform(localFilePath);
    const waveformBuffer = Buffer.from(
      JSON.stringify({ points: waveformPoints }),
    );

    console.log("[worker] Encrypting original...");
    encryptFile(localFilePath, encPath);

    const mp3Key = `transcoded/${baseName}.mp3`;
    const waveformKey = `waveforms/${baseName}.json`;
    const encryptedKey = `encrypted/${baseName}.enc`;

    console.log("[worker] Uploading to S3...");
    await Promise.all([
      uploadFileToS3(mp3Path, mp3Key, "audio/mpeg"),
      uploadBufferToS3(waveformBuffer, waveformKey, "application/json"),
      uploadFileToS3(encPath, encryptedKey, "application/octet-stream"),
    ]);

    await markJobCompleted(trackingId, mp3Key, waveformKey, encryptedKey);
    console.log(`[worker] Job ${trackingId} completed.`);

    cleanUp(localFilePath, mp3Path, encPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Job ${trackingId} failed:`, msg);
    await markJobFailed(trackingId, msg);
    cleanUp(mp3Path, encPath); // leave original for debugging
    throw err;
  }
};

const poll = async (): Promise<void> => {
  console.log("[worker] SQS poller started.");
  while (true) {
    try {
      // check on the queue
      const result = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: QUEUE_URL,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 20, // long polling
        }),
      );

      if (!result.Messages?.length) continue;

      // go thru received messages
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

        // we know the payload will be a job, process it
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
      await new Promise((r) => setTimeout(r, 5000)); // back off before retry
    }
  }
};

poll();
