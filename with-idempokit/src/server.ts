import express, { NextFunction, Request, Response } from "express";
import { handleCreatePayment } from "./handlers/create-payment";
import config from "./config/env";
import {
  connectToMongo,
  connectToPostgres,
  connectToRedis,
} from "./config/database";

export const app = express();

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});
app.use(express.json());

const PORT = config.port || 3000;

app.post("/payments", handleCreatePayment);

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const status = err.status ?? 500;
  const message = status === 500 ? "Internal server error" : err.message;

  res.status(status).json({
    error: message,
    code: err.code,
  });
});
app.listen(PORT, async () => {
  try {
    await connectToPostgres();
    await connectToMongo();
    await connectToRedis();
    console.log(`server listening at port ${PORT}`);
  } catch (error) {
    console.error("Failed to initialize database connections:", error);
    console.error("closing server...");
    process.exit(1);
  }
});
