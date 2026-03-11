import { S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SQSClient } from "@aws-sdk/client-sqs";
import * as dotenv from "dotenv";

// load in environment vars
dotenv.config();
if (
  !process.env.AWS_REGION ||
  !process.env.AWS_ACCESS_KEY_ID ||
  !process.env.AWS_SECRET_ACCESS_KEY
) {
  throw new Error(
    "FATAL ERROR: Missing required AWS environment variables in .env file.",
  );
}

const awsConfig = {
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

export const s3Client = new S3Client(awsConfig);
export const dynamoClient = new DynamoDBClient(awsConfig);
export const sqsClient = new SQSClient(awsConfig);
