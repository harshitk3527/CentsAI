import "server-only";

import { MongoClient, ObjectId, type Db } from "mongodb";
import { ConfigurationError } from "./http";

export interface UserRecord {
  _id: ObjectId | string;
  username: string;
  email: string;
  password: string;
}

export interface ExpenseRecord {
  _id: ObjectId | string;
  userId: string;
  amount: number;
  date: Date | string;
  category?: string | null;
}

declare global {
  var centsAiDb: Promise<Db> | undefined;
}

export function getDb(): Promise<Db> {
  if (!globalThis.centsAiDb) {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new ConfigurationError("Set MONGO_URI to your MongoDB connection string");

    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });
    globalThis.centsAiDb = client.connect()
      .then(() => client.db(process.env.MONGO_DB || undefined))
      .catch(async (error: unknown) => {
        globalThis.centsAiDb = undefined;
        await client.close();
        throw error;
      });
  }
  return globalThis.centsAiDb;
}

export function mongoIds(id: string) {
  return { $in: ObjectId.isValid(id) ? [new ObjectId(id), id] : [id] };
}
