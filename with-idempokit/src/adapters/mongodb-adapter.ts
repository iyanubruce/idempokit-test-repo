import { MongoAdapter } from "@idempotkit/mongodb-adapter";
import { db } from "../config/database";

let mongoAdapter: MongoAdapter;

export const getMongoAdapter = async () => {
  mongoAdapter = new MongoAdapter(db);
  return mongoAdapter;
};
