import { describe, it, expect, afterAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../config/aws.js";
import {
  uploadFileToS3,
  uploadBufferToS3,
  getPresignedUrl,
} from "../services/s3Service.js";
import fs from "fs";
import os from "os";
import path from "path";

const BUCKET = process.env.S3_BUCKET_NAME!;
const uploadedKeys: string[] = [];

afterAll(async () => {
  await Promise.all(
    uploadedKeys.map((key) =>
      s3Client
        .send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
        .catch(() => {}),
    ),
  );
});

describe("S3 integration", () => {
  it("uploadBufferToS3 uploads a buffer without error", async () => {
    const key = `test/${uuidv4()}.json`;
    uploadedKeys.push(key);

    const buffer = Buffer.from(JSON.stringify({ points: [0.1, 0.5, 0.9] }));
    await expect(
      uploadBufferToS3(buffer, key, "application/json"),
    ).resolves.not.toThrow();
  });

  it("uploadFileToS3 uploads a local file without error", async () => {
    const tmpPath = path.join(os.tmpdir(), `test-${uuidv4()}.txt`);
    fs.writeFileSync(tmpPath, "placeholder audio content");

    const key = `test/${uuidv4()}.txt`;
    uploadedKeys.push(key);

    try {
      await expect(
        uploadFileToS3(tmpPath, key, "text/plain"),
      ).resolves.not.toThrow();
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });

  it("getPresignedUrl returns a valid HTTPS URL pointing to the bucket", async () => {
    const key = `test/${uuidv4()}.json`;
    uploadedKeys.push(key);
    await uploadBufferToS3(Buffer.from("{}"), key, "application/json");

    const url = await getPresignedUrl(key);
    expect(url).toMatch(/^https:\/\//);
    expect(url).toContain(BUCKET);
    expect(url).toContain(encodeURIComponent(key).replace(/%2F/g, "/"));
  });

  it("getPresignedUrl respects a custom expiry of 60 seconds", async () => {
    const key = `test/${uuidv4()}.json`;
    uploadedKeys.push(key);
    await uploadBufferToS3(Buffer.from("{}"), key, "application/json");

    const url = await getPresignedUrl(key, 60);
    expect(url).toContain("X-Amz-Expires=60");
  });
});
