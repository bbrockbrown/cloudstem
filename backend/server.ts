import express from "express";
import type {
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from "express";
import cors, { type CorsOptions } from "cors";
import { asyncHandler } from "./src/util/asyncWrapper.js";
import apiRoutes from "./src/routes/apiRoutes.js";
import * as dotenv from "dotenv";

// load in environment vars
dotenv.config();

const app = express();

const allowedOrigins = [process.env.FRONTEND_URL_DEV, process.env.FRONTEND_URL];

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // if origin of request not in allowedOrigins, don't allow it
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  // true b/c we are dealing w/ cookies
  credentials: true,
};

// additional server config
app.use(cors(corsOptions));
app.use(
  express.json({
    strict: false, // we will be uploading large files (.wav)
  }),
);
app.use(express.urlencoded({ extended: true }));

// global error handler
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err.status || 500;
  const message = err.message || "Internal Server Error";

  res.status(status).json({
    success: false,
    status,
    message,
    // include stack trace only in development
    stack: process.env.NODE_ENV === "development" ? err.stack : {},
  });
};

// all of our routes
app.use("/api", apiRoutes);

app.get(
  "/health",
  asyncHandler(async (_req: Request, res: Response) => {
    res.status(200).json({ message: "working!" });
  }),
);

app.use(errorHandler);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`app is running on port: ${PORT}`);
  console.log(`production environment: ${process.env.NODE_ENV}`);
  console.log(`allowed URLs: ${allowedOrigins.join(", ")}`);
});
