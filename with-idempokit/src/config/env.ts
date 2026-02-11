import dotenv from "dotenv";

dotenv.config();

export default {
  port: parseInt(process.env.PORT || "4045"),
  redisUrl: process.env.REDIS_URL || "redis://localhost:6380",
  postgresConfig: {
    host: process.env.PG_HOST || "localhost",
    port: parseInt(process.env.PG_PORT || "5432"),
    user: process.env.PG_USER || "postgres",
    password: process.env.PG_PASSWORD || "postgres",
    database: process.env.PG_DATABASE || "postgres",
  },
  mongoUri: process.env.MONGODB_URI || "mongodb://localhost:27017/paymentdb",
  idempotencyAdapter: process.env.IDEMPOTENCY_ADAPTER || "redis",
};
