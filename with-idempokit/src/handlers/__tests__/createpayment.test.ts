// src/__tests__/payment-api.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../server"; // Your Express app
import config from "../../config/env";
import { Pool } from "pg";
import { MongoClient } from "mongodb";
import { Redis } from "ioredis";

// Database clients for cleanup
let postgresPool: Pool;
let mongoClient: MongoClient;
let redisClient: Redis;

// Test payment data
const validPaymentData = {
  amount: 1000,
  currency: "NGN",
  customerId: "cus_123",
  clientId: "client_456",
  userId: "user_789",
  email: "test@example.com",
};

// Helper to run tests for each adapter
async function runIdempotencyTests(adapterType: string) {
  const idempotencyKey = `test-key-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  describe(`Payment API with ${adapterType} adapter`, () => {
    beforeEach(async () => {
      // Clean up database state before each test
      await cleanupDatabase(adapterType);
    });

    it("should process payment successfully on first request", async () => {
      const response = await request(app)
        .post("/payments")
        .set("Idempotency-Key", idempotencyKey)
        .set("X-Request-Id", "req-123")
        .send(validPaymentData)
        .expect(201);

      expect(response.body).toMatchObject({
        paymentId: expect.stringMatching(/^pay_/),
        status: "succeeded",
        amount: 1000,
        currency: "NGN",
        customerId: "cus_123",
      });
    });

    it("should return same result for duplicate requests (idempotency)", async () => {
      // First request
      const response1 = await request(app)
        .post("/payments")
        .set("Idempotency-Key", idempotencyKey)
        .set("X-Request-Id", "req-123")
        .send(validPaymentData)
        .expect(201);

      // Second request with same idempotency key
      const response2 = await request(app)
        .post("/payments")
        .set("Idempotency-Key", idempotencyKey)
        .set("X-Request-Id", "req-456") // Different request ID
        .send(validPaymentData)
        .expect(201);

      // Should return identical results
      expect(response2.body).toEqual(response1.body);
    });

    it("should reject requests with different payload (fingerprint mismatch)", async () => {
      // First request
      await request(app)
        .post("/payments")
        .set("Idempotency-Key", idempotencyKey)
        .set("X-Request-Id", "req-123")
        .send(validPaymentData)
        .expect(201);

      // Second request with different payload
      const modifiedPaymentData = {
        ...validPaymentData,
        amount: 2000, // Different amount
      };

      const response = await request(app)
        .post("/payments")
        .set("Idempotency-Key", idempotencyKey)
        .set("X-Request-Id", "req-456")
        .send(modifiedPaymentData)
        .expect(409);

      expect(response.body).toEqual({
        error: "Request payload differs from original request",
      });
    });

    it("should handle concurrent requests correctly", async () => {
      // Send multiple concurrent requests
      const promises = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post("/payments")
          .set("Idempotency-Key", idempotencyKey)
          .set("X-Request-Id", `req-concurrent-${i}`)
          .send(validPaymentData),
      );

      const responses = await Promise.all(promises);

      // Exactly one should succeed, others should get "already processing" or same result
      const successResponses = responses.filter((r) => r.statusCode === 201);
      const conflictResponses = responses.filter((r) => r.statusCode === 409);

      expect(successResponses.length).toBeGreaterThanOrEqual(1);
      expect(conflictResponses.length).toBeLessThanOrEqual(4);

      // All successful responses should be identical
      if (successResponses.length > 1) {
        const firstResult = successResponses[0].body;
        for (let i = 1; i < successResponses.length; i++) {
          expect(successResponses[i].body).toEqual(firstResult);
        }
      }
    });

    it("should enforce idempotency key validation", async () => {
      // Too short key
      await request(app)
        .post("/payments")
        .set("Idempotency-Key", "short")
        .send(validPaymentData)
        .expect(400)
        .expect({
          code: "INVALID_IDEMPOTENCY_KEY",
          error: "Idempotency-Key must be between 8 and 64 characters",
        });

      // Too long key
      await request(app)
        .post("/payments")
        .set("Idempotency-Key", "a".repeat(65))
        .send(validPaymentData)
        .expect(400)
        .expect({
          code: "INVALID_IDEMPOTENCY_KEY",
          error: "Idempotency-Key must be between 8 and 64 characters",
        });

      // Missing key
      await request(app)
        .post("/payments")
        .send(validPaymentData)
        .expect(400)
        .expect({
          code: "MISSING_IDEMPOTENCY_KEY",
          error: "Missing Idempotency-Key header",
        });
    });
    // Replace the audit log test with this version
    it("should include audit logs in console output", async () => {
      // Capture console.log calls properly
      const originalLog = console.log;
      const loggedMessages: any[] = [];

      // Override console.log to capture actual objects
      console.log = (...args) => {
        if (args[0] === "📝 AUDIT:") {
          loggedMessages.push(args[1]); // Capture the actual object, not string
        }
        originalLog(...args);
      };

      try {
        await request(app)
          .post("/payments")
          .set("Idempotency-Key", idempotencyKey)
          .set("X-Request-Id", "req-audit")
          .send(validPaymentData)
          .expect(201);

        // Verify audit log was called
        expect(loggedMessages.length).toBeGreaterThan(0);

        // Verify PII is filtered (email should not appear in audit)
        const auditLog = loggedMessages[0];
        expect(auditLog.metadata).not.toHaveProperty("email");
        expect(auditLog.metadata).toHaveProperty("requestId");
        expect(auditLog.metadata).toHaveProperty("clientId");
        expect(auditLog.metadata).toHaveProperty("ip");
      } finally {
        console.log = originalLog;
      }
    });
  });
}

// Cleanup functions for each database
async function cleanupDatabase(adapterType: string) {
  switch (adapterType) {
    case "redis":
      await redisClient.flushdb();
      break;
    case "postgres":
      await postgresPool.query("DELETE FROM idempotency_keys");
      await postgresPool.query("DELETE FROM idempotency_audit");
      break;
    case "mongodb":
      const db = mongoClient.db("idempotkit_test");
      await db.collection("idempotency_keys").deleteMany({});
      await db.collection("idempotency_audit").deleteMany({});
      break;
  }
}

// Setup and teardown
beforeAll(async () => {
  // Initialize database connections
  postgresPool = new Pool({
    connectionString: "postgresql://postgres:postgres@localhost:5432/postgres",
  });

  mongoClient = new MongoClient("mongodb://localhost:27017");
  await mongoClient.connect();

  redisClient = new Redis({
    host: "localhost",
    port: 6379,
  });

  // Wait for connections to be ready
  await postgresPool.query("SELECT 1");
  await mongoClient.db("idempotkit_test").command({ ping: 1 });
  await redisClient.ping();
});

afterAll(async () => {
  // Close all connections
  await postgresPool.end();
  await mongoClient.close();
  await redisClient.quit();
});

// Run tests for each adapter type
describe("Payment API Integration Tests", () => {
  // Test with Redis
  beforeAll(() => {
    config.idempotencyAdapter = "redis";
  });
  runIdempotencyTests("redis");

  // Test with PostgreSQL
  beforeAll(() => {
    config.idempotencyAdapter = "postgres";
  });
  runIdempotencyTests("postgres");

  // Test with MongoDB
  beforeAll(() => {
    config.idempotencyAdapter = "mongodb";
  });
  runIdempotencyTests("mongodb");
});
