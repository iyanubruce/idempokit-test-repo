import { RedisAdapter } from "@idempotkit/redis-adapter";
import { redisClient } from "../config/database";

let redisAdapter: RedisAdapter;

export const getRedisAdapter = () => {
  redisAdapter = new RedisAdapter(redisClient);
  return redisAdapter;
};
