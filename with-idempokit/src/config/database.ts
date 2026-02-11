import { Pool } from "pg";
import { Redis } from "ioredis";
import { MongoClient } from "mongodb";
import config from "./env";

export const redisClient = new Redis(config.redisUrl);

export const connectToRedis = async () => {
  try {
    await redisClient.ping();
    console.log("✅ Connected to Redis successfully");
    return redisClient;
  } catch (error) {
    console.error("❌ Failed to connect to Redis:", error);
    throw error;
  }
};

export const pool = new Pool(config.postgresConfig);

export const connectToPostgres = async () => {
  try {
    await pool.connect();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        result JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS idempotency_audit (
        id SERIAL PRIMARY KEY,
        key TEXT NOT NULL,
        action TEXT NOT NULL,
        fingerprint TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      
      -- Make audit table immutable (compliance requirement)
      REVOKE UPDATE, DELETE ON idempotency_audit FROM PUBLIC;
    `);
    console.log("✅ Connected to PostgreSQL and ensured tables exist");
    return pool;
  } catch (error) {
    console.error("❌ Failed to connect to PostgreSQL:", error);
    throw error;
  }
};

export const getMongoClient = () => {
  return new MongoClient(config.mongoUri);
};

const mongoClient = getMongoClient();
export const db = mongoClient.db("payments");

export const connectToMongo = async () => {
  try {
    await mongoClient.connect();
    // Ensure indexes exist
    await db
      .collection("idempotency_keys")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    console.log("✅ Connected to MongoDB successfully");
    return mongoClient;
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error);
    throw error;
  }
};
export const closeConnections = async () => {
  try {
    await redisClient.quit();
    await pool.end();
    await mongoClient.close();
    console.log("✅ All connections closed successfully");
  } catch (error) {
    console.error("❌ Error closing connections:", error);
    throw error;
  }
};
