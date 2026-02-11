import { Request, Response } from "express";
import { IdempotencyEngine } from "@idempotkit/core";
import config from "../config/env";
import { getRedisAdapter } from "../adapters/redis-adapter";
import { getPostgresAdapter } from "../adapters/postgres-adapter";
import { getMongoAdapter } from "../adapters/mongodb-adapter";

// Audit logger (for compliance)
function auditLogger(event: any) {
  console.log("📝 AUDIT:", {
    key: event.key,
    action: event.action,
    timestamp: event.timestamp,
    metadata: event.metadata,
  });
}

async function processPayment(paymentData: any): Promise<any> {
  console.log("💳 Processing payment:", paymentData);

  await new Promise((resolve) => setTimeout(resolve, 100));

  return {
    paymentId: `pay_${Date.now()}`,
    status: "succeeded",
    amount: paymentData.amount,
    currency: paymentData.currency,
    customerId: paymentData.customerId,
  };
}
async function getIdempotencyEngine() {
  const adapterType = config.idempotencyAdapter;

  let adapter;
  switch (adapterType) {
    case "redis":
      adapter = getRedisAdapter();
      break;
    case "postgres":
      adapter = await getPostgresAdapter();
      break;
    case "mongodb":
      adapter = await getMongoAdapter();
      break;
    default:
      throw new Error(`Unsupported adapter: ${adapterType}`);
  }

  return new IdempotencyEngine(adapter, {
    lockTtl: 30_000, // 30 seconds lock timeout
    retention: 86_400_000, // 24 hours retention (PCI-DSS compliant)
    onAudit: auditLogger,
    keyPrefix: "payment:", // Optional key prefix
  });
}

const validateRequest = (req: Request) => {
  const idempotencyKey = req.headers["idempotency-key"] as string;
  if (!idempotencyKey) {
    throw new ApiError(
      "Missing Idempotency-Key header",
      400,
      "MISSING_IDEMPOTENCY_KEY",
    );
  }

  if (idempotencyKey.length < 8 || idempotencyKey.length > 64) {
    throw new ApiError(
      "Idempotency-Key must be between 8 and 64 characters",
      400,
      "INVALID_IDEMPOTENCY_KEY",
    );
  }

  return {
    idempotencyKey,
  };
};
export async function handleCreatePayment(req: Request, res: Response) {
  try {
    // Validate required headers
    const { idempotencyKey } = validateRequest(req);

    const engine = await getIdempotencyEngine();
    const result = await engine.execute(
      idempotencyKey,
      engine.fingerprint(req.body), // Automatic fingerprinting
      () => processPayment(req.body),
      {
        metadata: {
          requestId: req.headers["x-request-id"],
          clientId: req.body.clientId,
          userId: req.body.userId,
          email: req.body.email,
          ip: req.ip,
        },
        handlerTimeout: 30_000, // 30 second handler timeout
      },
    );

    return res.status(201).json(result);
  } catch (error: any) {
    // ✅ ADD THIS: Handle validation errors
    if (error instanceof ApiError) {
      return res.status(error.status).json({
        error: error.message,
        code: error.code,
      });
    }

    console.error("Payment handler error:", error);

    if (error.name === "FingerprintMismatchError") {
      return res.status(409).json({
        error: "Request payload differs from original request",
      });
    }

    if (error.name === "OperationInProgressError") {
      return res.status(409).json({
        error: "Payment is already being processed",
      });
    }

    if (error.name === "HandlerTimeoutError") {
      return res.status(408).json({
        error: "Payment processing timed out",
      });
    }

    return res.status(500).json({ error: "Internal server error" });
  }
}

class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    // Make the stack trace point to the correct place
    Error.captureStackTrace?.(this, ApiError);
  }
}
