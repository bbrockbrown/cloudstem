PREREQUISITES
-------------
- Node.js 22+
- ffmpeg (brew install ffmpeg on macOS)
- AWS account with the following resources created:
    S3 bucket          (any name, block all public access)
    SQS standard queue (visibility timeout: 300s)
    DynamoDB table     (name: AudioProcessingJobs, partition key: trackingId, type: String)
- IAM user or role with read/write access to the above three services


ENVIRONMENT VARIABLES
----------------------
Both backend/ and frontend/ have a .env.example. Copy each to .env and fill in:

backend/.env:
    PORT=8000
    NODE_ENV=development
    FRONTEND_URL=http://localhost:3000
    AWS_REGION=us-east-2
    AWS_ACCESS_KEY_ID=<your key>
    AWS_SECRET_ACCESS_KEY=<your secret>
    S3_BUCKET_NAME=<your bucket>
    SQS_QUEUE_URL=https://sqs.<region>.amazonaws.com/<account>/<queue>
    DYNAMODB_TABLE_NAME=AudioProcessingJobs
    ENCRYPTION_KEY=<64 hex chars >

frontend/.env:
    BACKEND_URL=http://localhost:8000


RUNNING LOCALLY
---------------
Three terminals are needed:

1. API server
       cd backend
       npm install
       npm run dev          # express on http://localhost:8000

2. Audio processing worker
       cd backend
       npm run worker       # long-polls SQS and processes audio

3. Frontend
       cd frontend
       npm install
       npm run dev          # Next.js on http://localhost:3000

Open http://localhost:3000 in a browser.


EC2 DEPLOYMENT (how the project is deployed)
---------------------------------------------
1. Launch an Amazon Linux 2023 EC2 instance (t3.medium or larger).
   Open inbound ports 22 (SSH) and 8000 (API) in the security group.

2. SSH in and run the bootstrap script:
       ssh -i your-key.pem ec2-user@<public-ip>
       bash scripts/ec2-setup.sh
   This installs Node.js 22, ffmpeg, git, and pm2.

3. Copy backend/.env to the server and fill in production values.
   Set FRONTEND_URL to your frontend's URL.

4. Start both backend processes with pm2:
       pm2 start ecosystem.config.cjs
       pm2 save && pm2 startup

5. The frontend is hosted on Vercel (see frontend/.env for BACKEND_URL).
   Deploy by pushing to main — Vercel picks it up automatically.

Verify the backend is running:
       curl http://localhost:8000/health
       -> {"message":"working!"}
