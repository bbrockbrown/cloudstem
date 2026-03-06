import express from "express";
import type {
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from "express";
import cors from "cors";
import { asyncHandler } from "./util/asyncWrapper.js";

const app = express();
app.use(
  express.json({
    strict: false,
  }),
);

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
app.use(errorHandler);

app.get(
  "/health",
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ message: "working!" });
  }),
);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`app is running on port: ${PORT}`);
});
