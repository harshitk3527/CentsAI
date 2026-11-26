import "server-only";

import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { MongoServerError, ObjectId } from "mongodb";
import { z } from "zod";
import type { AuthResponse } from "@/lib/api-contracts";
import { getDb, mongoIds, type FinancialCacheUser, type UserRecord } from "./db";
import { apiRoute, ConfigurationError, HttpError, readBody } from "./http";

const credentials = z.object({
  email: z.string().trim().pipe(z.email("Enter a valid email address")),
  password: z.string().refine((value) => value.trim().length > 0, "Password is required"),
});

const registration = credentials.extend({
  username: z.string().trim().min(1, "Username cannot be blank"),
  password: credentials.shape.password
    .refine((value) => value.length >= 6, "Password must be at least 6 characters")
    .refine((value) => !bcrypt.truncates(value), "Password must be at most 72 UTF-8 bytes"),
});

export function signingKey() {
  const key = new TextEncoder().encode(process.env.JWT_SECRET);
  if (key.length < 32) throw new ConfigurationError("Set JWT_SECRET to at least 32 UTF-8 bytes");
  return key;
}

export async function createAuthSession(user: UserRecord): Promise<AuthResponse> {
  const userId = user._id.toString();
  const expiresIn = Math.floor(Number(process.env.JWT_EXPIRATION ?? 604_800_000) / 1000);
  if (!Number.isSafeInteger(expiresIn) || expiresIn <= 0) {
    throw new ConfigurationError("Set JWT_EXPIRATION to a lifetime of at least 1000 milliseconds");
  }

  const token = await new SignJWT({ username: user.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
    .sign(signingKey());

  return { user_id: userId, username: user.username, token };
}

async function authResponse(user: UserRecord, status: number) {
  return Response.json(await createAuthSession(user), {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export const register = apiRoute(async (request: Request) => {
  const { email, username, password } = await readBody(request, registration);
  const user = { _id: new ObjectId(), email, username, password: await bcrypt.hash(password, 10) };
  const response = await authResponse(user, 201);
  const users = (await getDb()).collection<UserRecord>("users");

  await users.createIndex({ email: 1 }, { unique: true });
  try {
    await users.insertOne(user);
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw new HttpError(409, "User with this email address already exists");
    }
    throw error;
  }
  return response;
});

export const login = apiRoute(async (request: Request) => {
  const { email, password } = await readBody(request, credentials);
  const user = await (await getDb()).collection<UserRecord>("users").findOne({ email });
  if (!user?.password || !(await bcrypt.compare(password, user.password))) {
    throw new HttpError(404, "Invalid email or password");
  }
  return authResponse(user, 200);
});

export async function authorize(request: Request, userId: string) {
  const token = /^Bearer (\S+)$/i.exec(request.headers.get("Authorization") ?? "")?.[1];
  if (!token) throw new HttpError(401, "Authentication required");

  const key = signingKey();
  let subject: string | undefined;
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      requiredClaims: ["sub", "exp"],
    });
    subject = payload.sub;
  } catch {
    throw new HttpError(401, "Invalid or expired session");
  }
  if (subject !== userId) throw new HttpError(403, "Access denied");

  const db = await getDb();
  const user = await db.collection<UserRecord>("users").findOne<FinancialCacheUser>(
    { _id: mongoIds(userId) },
    { projection: { _id: 1, transactionsRevision: 1, budgetsRevision: 1 } },
  );
  if (!user) throw new HttpError(404, "User not found");
  return { db, user };
}
