import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { createClient } from "redis";
import type { ZodType } from "zod";
import type { FinancialCacheUser, UserRecord } from "./db";

type RedisClient = ReturnType<typeof createRedisClient>;
const defaultTtl = 12 * 60 * 60;

interface RedisConnection {
  client?: RedisClient;
  connecting?: Promise<RedisClient | null>;
  retryAfter: number;
}

declare global {
  var centsAiRedis: RedisConnection | undefined;
}

const redis = globalThis.centsAiRedis ??= { retryAfter: 0 };

function createRedisClient(url: string) {
  return createClient({
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: 1500, reconnectStrategy: false },
    commandOptions: { timeout: 750, rejectInFlight: true },
  });
}

async function connectRedis(url: string): Promise<RedisClient | null> {
  try {
    const client = createRedisClient(url);
    client.on("error", () => { redis.retryAfter = Date.now() + 30_000; });
    const timeout = setTimeout(() => {
      if (client.isOpen && !client.isReady) client.destroy();
    }, 2000);
    try {
      await client.connect();
    } finally {
      clearTimeout(timeout);
    }
    redis.client = client;
    return client;
  } catch (error) {
    redis.retryAfter = Date.now() + 30_000;
    console.warn("Redis read cache unavailable", error instanceof Error ? error.name : "Unknown error");
    return null;
  }
}

async function getRedisClient() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (redis.client?.isReady) return redis.client;
  if (redis.connecting) return redis.connecting;
  if (Date.now() < redis.retryAfter) return null;

  redis.connecting = connectRedis(url).finally(() => { redis.connecting = undefined; });
  return redis.connecting;
}

type CacheTarget = { kind: "transactions" } | { kind: "budgets"; month: string };

function cacheKey(db: Db, user: FinancialCacheUser, target: CacheTarget) {
  const revision = target.kind === "transactions" ? user.transactionsRevision : user.budgetsRevision;
  const deployment = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_URL ?? process.env.NODE_ENV;
  const key = createHash("sha256").update(JSON.stringify([
    deployment, db.databaseName, user._id.toString(), revision ?? "initial",
    target.kind === "budgets" ? target.month : null,
  ])).digest("hex");
  return `centsai:finance:v1:${target.kind}:${key}`;
}

export async function readFinancialCache<T>(
  db: Db,
  user: FinancialCacheUser,
  target: CacheTarget,
  schema: ZodType<T>,
  read: () => Promise<T>,
): Promise<T> {
  const client = await getRedisClient();
  if (!client) return read();

  const key = cacheKey(db, user, target);
  let raw: string | null;
  try {
    raw = await client.get(key);
  } catch {
    return read();
  }
  if (raw !== null) {
    try {
      const cached: unknown = JSON.parse(raw);
      const parsed = schema.safeParse(cached);
      if (parsed.success) return parsed.data;
    } catch {
      // An invalid cache entry can be replaced with the database value.
    }
  }

  const result = await read();
  const ttl = Number(process.env.REDIS_CACHE_TTL_SECONDS ?? defaultTtl);
  try {
    await client.set(key, JSON.stringify(result), {
      expiration: { type: "EX", value: Number.isSafeInteger(ttl) && ttl > 0 ? ttl : defaultTtl },
    });
  } catch {
    // The database value is still available when Redis cannot cache it.
  }
  return result;
}

export async function invalidateFinancialCache(db: Db, user: FinancialCacheUser, target: CacheTarget) {
  if (!process.env.REDIS_URL) return;

  const revisionField = target.kind === "transactions" ? "transactionsRevision" : "budgetsRevision";
  try {
    // Even during a Redis outage, old cached reads must stay unreachable after a successful database write.
    await db.collection<UserRecord>("users").updateOne({ _id: user._id }, { $set: { [revisionField]: randomUUID() } });
  } catch (error) {
    console.error("Financial cache revision update failed", error instanceof Error ? error.name : "Unknown error");
  }
  const client = await getRedisClient();
  await client?.del(cacheKey(db, user, target)).catch(() => {});
}
