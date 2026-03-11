import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { sqsClient } from "../config/aws.js";
import * as dotenv from "dotenv";

// load in environment vars
dotenv.config();

export const queueAudioForProcessing = async (
  trackingId: string,
  originalFileName: string,
  localFilePath: string,
): Promise<void> => {
  const queueUrl = process.env.SQS_QUEUE_URL;
  if (!queueUrl) {
    throw new Error("SQS_QUEUE_URL not initialized in .env");
  }

  // payload the background worker will need to find + process
  const messageBody = JSON.stringify({
    trackingId,
    originalFileName,
    localFilePath,
    timestamp: new Date().toISOString(),
  });

  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: messageBody,
  });

  try {
    const res = await sqsClient.send(command);
    console.log(
      `Successfully queued message for ${trackingId}. MessageId: ${res.MessageId}`,
    );
  } catch (err) {
    console.error(`Failed to queue message for ${trackingId}:`, err);
    throw err; // re-throw so controller can handle failure
  }
};
