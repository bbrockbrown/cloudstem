import express from "express";
import { createServer } from "http";
import type {
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from "express";
import cors, { type CorsOptions } from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { asyncHandler } from "./src/util/asyncWrapper.js";
import { getJob } from "./src/services/dynamoService.js";
import { getPresignedUrl } from "./src/services/s3Service.js";
import apiRoutes from "./src/routes/apiRoutes.js";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();
const httpServer = createServer(app);

const allowedOrigins = [process.env.FRONTEND_URL_DEV, process.env.FRONTEND_URL];

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(
  express.json({
    strict: false,
  }),
);
app.use(express.urlencoded({ extended: true }));

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err.status || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({
    success: false,
    status,
    message,
    stack: process.env.NODE_ENV === "development" ? err.stack : {},
  });
};

app.use("/api", apiRoutes);

app.get(
  "/health",
  asyncHandler(async (_req: Request, res: Response) => {
    res.status(200).json({ message: "working!" });
  }),
);

app.use(errorHandler);

// initialize the websocket
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws: WebSocket, req) => {
  const url = req.url ?? "";
  if (!url.startsWith("/api/ws/")) {
    ws.close(1008, "Invalid WebSocket path");
    return;
  }
  const trackingId = url.slice("/api/ws/".length);
  if (!trackingId) {
    ws.close(1008, "trackingId required in path");
    return;
  }

  let closed = false;

  const sendJSON = (data: unknown) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };

  const tick = async () => {
    if (closed) return;
    try {
      const job = await getJob(trackingId);
      if (!job) {
        sendJSON({ error: "Job not found" });
        ws.close();
        return;
      }

      if (job.status === "Complete" && job.mp3Key && job.waveformKey && job.encryptedKey) {
        const [mp3Url, waveformUrl, encryptedUrl] = await Promise.all([
          getPresignedUrl(job.mp3Key),
          getPresignedUrl(job.waveformKey),
          getPresignedUrl(job.encryptedKey),
        ]);
        sendJSON({ ...job, mp3Url, waveformUrl, encryptedUrl });
        ws.close();
        return;
      }

      if (job.status === "Failed") {
        sendJSON(job);
        ws.close();
        return;
      }

      // Still processing — send current state and schedule next tick
      sendJSON(job);
      if (!closed) setTimeout(tick, 1000);
    } catch (err) {
      console.error("[ws] poll error:", err);
      if (!closed) setTimeout(tick, 2000);
    }
  };

  ws.on("close", () => {
    closed = true;
  });

  // Start polling immediately
  tick();
});

const PORT = process.env.PORT || 8000;
httpServer.listen(PORT, () => {
  console.log(`app is running on port: ${PORT}`);
  console.log(`production environment: ${process.env.NODE_ENV}`);
  console.log(`allowed URLs: ${allowedOrigins.join(", ")}`);
});
