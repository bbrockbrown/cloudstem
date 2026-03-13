import { dynamoClient } from "../config/aws.js";
import {
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import * as dotenv from "dotenv";
import type { JobRecord, JobStatus } from "../util/types.js";

dotenv.config();

const TABLE = process.env.DYNAMODB_TABLE_NAME;
if (!TABLE) throw new Error("DYNAMODB_TABLE_NAME is not set in .env");

export const createJob = async (
  trackingId: string,
  originalFileName: string,
): Promise<void> => {
  // create a new job in dynamo table
  await dynamoClient.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: {
        trackingId: { S: trackingId },
        originalFileName: { S: originalFileName },
        status: { S: "Processing" },
        createdAt: { S: new Date().toISOString() },
      },
    }),
  );
};

export const getJob = async (trackingId: string): Promise<JobRecord | null> => {
  // get song from table
  const res = await dynamoClient.send(
    new GetItemCommand({
      TableName: TABLE,
      Key: { trackingId: { S: trackingId } },
    }),
  );

  if (!res.Item) return null;

  // return job info, and keys if any
  return {
    trackingId: res.Item["trackingId"]?.S ?? "",
    originalFileName: res.Item["originalFileName"]?.S ?? "",
    status: (res.Item["status"]?.S ?? "Processing") as JobStatus,
    createdAt: res.Item["createdAt"]?.S ?? "",
    updatedAt: res.Item["updatedAt"]?.S,
    currentStep: res.Item["currentStep"]?.S,
    mp3Key: res.Item["mp3Key"]?.S,
    waveformKey: res.Item["waveformKey"]?.S,
    encryptedKey: res.Item["encryptedKey"]?.S,
    errorMessage: res.Item["errorMessage"]?.S,
  };
};

export const markJobCompleted = async (
  trackingId: string,
  mp3Key: string,
  waveformKey: string,
  encryptedKey: string,
): Promise<void> => {
  // update job status to complete
  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { trackingId: { S: trackingId } },
      UpdateExpression:
        "SET #s = :s, updatedAt = :t, mp3Key = :m, waveformKey = :w, encryptedKey = :e",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":s": { S: "Complete" },
        ":t": { S: new Date().toISOString() },
        ":m": { S: mp3Key },
        ":w": { S: waveformKey },
        ":e": { S: encryptedKey },
      },
    }),
  );
};

export const updateJobStep = async (
  trackingId: string,
  currentStep: string,
): Promise<void> => {
  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { trackingId: { S: trackingId } },
      UpdateExpression: "SET currentStep = :c, updatedAt = :t",
      ExpressionAttributeValues: {
        ":c": { S: currentStep },
        ":t": { S: new Date().toISOString() },
      },
    }),
  );
};

export const listJobs = async (): Promise<JobRecord[]> => {
  let res;
  try {
    res = await dynamoClient.send(new ScanCommand({ TableName: TABLE }));
  } catch (err) {
    console.error("[listJobs] DynamoDB Scan error:", err);
    throw err;
  }
  const items = (res.Items ?? []).map((item) => ({
    trackingId: item["trackingId"]?.S ?? "",
    originalFileName: item["originalFileName"]?.S ?? "",
    status: (item["status"]?.S ?? "Processing") as JobStatus,
    createdAt: item["createdAt"]?.S ?? "",
    updatedAt: item["updatedAt"]?.S,
    currentStep: item["currentStep"]?.S,
    mp3Key: item["mp3Key"]?.S,
    waveformKey: item["waveformKey"]?.S,
    encryptedKey: item["encryptedKey"]?.S,
    errorMessage: item["errorMessage"]?.S,
  }));
  return items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
};

export const markJobFailed = async (
  trackingId: string,
  errorMessage: string,
): Promise<void> => {
  // update job status to failed
  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: { trackingId: { S: trackingId } },
      UpdateExpression: "SET #s = :s, updatedAt = :t, errorMessage = :e",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":s": { S: "Failed" },
        ":t": { S: new Date().toISOString() },
        ":e": { S: errorMessage },
      },
    }),
  );
};
