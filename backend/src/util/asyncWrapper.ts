import type { Request, Response, NextFunction } from "express";

/*
  Future use cases, instead of writing try/catch in all handlers, just do:
  app.get('/some/endpoint', asyncHandler(async (req, res, next) => {
    [insert code here]
  }));
*/
export const asyncHandler =
  (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
