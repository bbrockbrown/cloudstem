import { describe, it, expect, afterAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "../config/aws.js";
import {
  createJob,
  getJob,
  markJobCompleted,
  markJobFailed,
} from "../services/dynamoService.js";

const TABLE = process.env.DYNAMODB_TABLE_NAME!;
const createdIds: string[] = [];

const newId = () => {
  const id = `test-${uuidv4()}.wav`;
  createdIds.push(id);
  return id;
};

afterAll(async () => {
  await Promise.all(
    createdIds.map((id) =>
      dynamoClient
        .send(
          new DeleteItemCommand({
            TableName: TABLE,
            Key: { trackingId: { S: id } },
          }),
        )
        .catch(() => {}),
    ),
  );
});

describe("DynamoDB integration", () => {
  it("createJob writes a Processing record", async () => {
    const id = newId();
    await createJob(id, "drums.wav");

    const job = await getJob(id);
    expect(job).not.toBeNull();
    expect(job?.trackingId).toBe(id);
    expect(job?.originalFileName).toBe("drums.wav");
    expect(job?.status).toBe("Processing");
    expect(job?.createdAt).toBeTruthy();
  });

  it("getJob returns null for a non-existent trackingId", async () => {
    const job = await getJob(`nonexistent-${uuidv4()}.wav`);
    expect(job).toBeNull();
  });

  it("markJobCompleted updates status and S3 keys", async () => {
    const id = newId();
    await createJob(id, "drums.wav");

    await markJobCompleted(
      id,
      `transcoded/${id}.mp3`,
      `waveforms/${id}.json`,
      `encrypted/${id}.enc`,
    );

    const job = await getJob(id);
    expect(job?.status).toBe("Complete");
    expect(job?.mp3Key).toBe(`transcoded/${id}.mp3`);
    expect(job?.waveformKey).toBe(`waveforms/${id}.json`);
    expect(job?.encryptedKey).toBe(`encrypted/${id}.enc`);
    expect(job?.updatedAt).toBeTruthy();
  });

  it("markJobFailed updates status and errorMessage", async () => {
    const id = newId();
    await createJob(id, "drums.wav");

    await markJobFailed(id, "FFmpeg codec not found");

    const job = await getJob(id);
    expect(job?.status).toBe("Failed");
    expect(job?.errorMessage).toBe("FFmpeg codec not found");
    expect(job?.updatedAt).toBeTruthy();
  });
});
