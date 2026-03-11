import { describe, it, expect } from "vitest";
import { v4 as uuidv4 } from "uuid";
import {
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import { sqsClient } from "../config/aws.js";
import { queueAudioForProcessing } from "../services/sqsService.js";

const QUEUE_URL = process.env.SQS_QUEUE_URL!;

interface MessageBody {
  trackingId: string;
  originalFileName: string;
  localFilePath: string;
  timestamp: string;
}

describe("SQS integration", () => {
  it("queueAudioForProcessing sends a message that can be received", async () => {
    const trackingId = `test-${uuidv4()}.wav`;
    const localFilePath = `/tmp/uploads/${trackingId}`;

    await queueAudioForProcessing(
      trackingId,
      "integration-test.wav",
      localFilePath,
    );

    // receive messages and find ours
    const result = await sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 5,
      }),
    );

    const ourMessage = result.Messages?.find((m) => {
      try {
        const body = JSON.parse(m.Body ?? "{}") as MessageBody;
        return body.trackingId === trackingId;
      } catch {
        return false;
      }
    });

    expect(ourMessage).toBeDefined();

    const body = JSON.parse(ourMessage!.Body!) as MessageBody;
    expect(body.trackingId).toBe(trackingId);
    expect(body.originalFileName).toBe("integration-test.wav");
    expect(body.localFilePath).toBe(localFilePath);
    expect(typeof body.timestamp).toBe("string");

    // clean up, delete the message so the worker doesn't process it
    await sqsClient.send(
      new DeleteMessageCommand({
        QueueUrl: QUEUE_URL,
        ReceiptHandle: ourMessage!.ReceiptHandle!,
      }),
    );
  }, 15000);
});
