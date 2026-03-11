import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../config/aws.js";
import fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

const BUCKET = process.env.S3_BUCKET_NAME;
if (!BUCKET) throw new Error("S3_BUCKET_NAME not set in .env");

export const uploadFileToS3 = async (
  localPath: string,
  s3Key: string,
  contentType: string,
): Promise<void> => {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: fs.readFileSync(localPath),
      ContentType: contentType,
    }),
  );
};

export const uploadBufferToS3 = async (
  buffer: Buffer,
  s3Key: string,
  contentType: string,
): Promise<void> => {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
};

export const getPresignedUrl = async (
  s3Key: string,
  expiresIn = 3600,
): Promise<string> => {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }),
    { expiresIn },
  );
};
