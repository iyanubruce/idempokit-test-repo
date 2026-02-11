import { PostgresAdapter } from "@idempotkit/postgres-adapter";
import { pool } from "../config/database";

let postgresAdapter: PostgresAdapter;

export const getPostgresAdapter = async () => {
  postgresAdapter = new PostgresAdapter(pool);
  return postgresAdapter;
};
