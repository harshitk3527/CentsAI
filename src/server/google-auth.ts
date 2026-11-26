import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { EncryptJWT, jwtDecrypt } from "jose";
import { MongoServerError, ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { GoogleSignInResponse } from "@/lib/api-contracts";
import { createAuthSession, signingKey } from "./auth";
import { getDb, type UserRecord } from "./db";
import { apiRoute, ConfigurationError, HttpError, readBody } from "./http";

const flowSchema = z.object({ state: z.string(), nonce: z.string(), verifier: z.string() });
const profileSchema = z.object({
  sub: z.string().min(1).max(255),
  email: z.email().max(254),
  name: z.string().trim().max(200).optional(),
});
const googleClaimsSchema = profileSchema.extend({ email_verified: z.literal(true), nonce: z.string() });
const completeSchema = z.object({ password: z.string().optional() });

const flow = { name: "centsai-google-flow", ttl: 600, sameSite: "lax" } as const;
const handoff = { name: "centsai-google-handoff", ttl: 300, sameSite: "strict" } as const;
type OAuthCookie = typeof flow | typeof handoff;

export function isGoogleSignInEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

function googleSettings() {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, GOOGLE_REDIRECT_URI: redirectUri } = process.env;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new ConfigurationError("Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI to enable Google sign-in");
  }
  const callback = URL.canParse(redirectUri) ? new URL(redirectUri) : null;
  const localHttp = callback?.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(callback.hostname);
  if (!callback || !(callback.protocol === "https:" || localHttp) || callback.username || callback.password ||
    callback.pathname !== "/api/auth/google/callback" || callback.search || callback.hash) {
    throw new ConfigurationError("GOOGLE_REDIRECT_URI must be the app's /api/auth/google/callback URL over HTTPS or localhost HTTP");
  }
  return { callback, clientId, client: new OAuth2Client(clientId, clientSecret, callback.href) };
}

function cookieKey() {
  return createHmac("sha256", signingKey()).update("CentsAI Google OAuth cookies").digest();
}

function cookieName(cookie: OAuthCookie, callback: URL) {
  return callback.protocol === "https:" ? `__Host-${cookie.name}` : cookie.name;
}

function writeCookie(response: NextResponse, callback: URL, cookie: OAuthCookie, value: string) {
  response.cookies.set(cookieName(cookie, callback), value, {
    httpOnly: true,
    secure: callback.protocol === "https:",
    path: "/",
    sameSite: cookie.sameSite,
    maxAge: value ? cookie.ttl : 0,
  });
}

function sealCookie(cookie: OAuthCookie, claims: Record<string, unknown>) {
  return new EncryptJWT(claims)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setAudience(cookie.name)
    .setExpirationTime(Math.floor(Date.now() / 1000) + cookie.ttl)
    .encrypt(cookieKey());
}

async function readCookie<T>(request: NextRequest, callback: URL, cookie: OAuthCookie, schema: z.ZodType<T>) {
  const value = request.cookies.get(cookieName(cookie, callback))?.value;
  if (!value) return null;
  const key = cookieKey();
  try {
    const { payload } = await jwtDecrypt(value, key, {
      audience: cookie.name,
      requiredClaims: ["exp"],
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
    });
    return schema.parse(payload);
  } catch {
    return null;
  }
}

const privateHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export const startGoogleSignIn = apiRoute(async () => {
  const { callback, client } = googleSettings();
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  const url = new URL(client.generateAuthUrl({
    scope: ["openid", "email", "profile"],
    state,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
    prompt: "select_account",
  }));
  url.searchParams.set("nonce", nonce);
  const response = NextResponse.redirect(url, { headers: privateHeaders });
  writeCookie(response, callback, flow, await sealCookie(flow, { state, nonce, verifier: codeVerifier }));
  writeCookie(response, callback, handoff, "");
  return response;
});

export const googleCallback = apiRoute(async (request: NextRequest) => {
  const { callback, client, clientId } = googleSettings();
  const params = request.nextUrl.searchParams;
  const transaction = await readCookie(request, callback, flow, flowSchema);
  const destination = new URL("/auth/google", callback);
  const code = params.get("code");
  let profile: z.infer<typeof profileSchema> | undefined;
  if (!params.has("error") && code && transaction && params.get("state") === transaction.state) {
    try {
      const { tokens } = await client.getToken({ code, codeVerifier: transaction.verifier });
      if (tokens.id_token) {
        const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
        const claims = googleClaimsSchema.parse(ticket.getPayload());
        if (claims.nonce === transaction.nonce) profile = profileSchema.parse(claims);
      }
    } catch {
      console.error("Google OAuth code exchange or ID token verification failed");
    }
  }
  if (!profile) destination.searchParams.set("error", params.get("error") === "access_denied" ? "cancelled" : "failed");

  const response = NextResponse.redirect(destination, { status: 303, headers: privateHeaders });
  writeCookie(response, callback, flow, "");
  writeCookie(response, callback, handoff, profile ? await sealCookie(handoff, profile) : "");
  return response;
});

export const completeGoogleSignIn = apiRoute(async (request: NextRequest) => {
  const { callback } = googleSettings();
  if (request.headers.get("origin") !== callback.origin) throw new HttpError(403, "Access denied");
  const profile = await readCookie(request, callback, handoff, profileSchema);
  if (!profile) throw new HttpError(401, "Google sign-in expired. Start again from the sign-in page.");
  const { password } = await readBody(request, completeSchema);
  const users = (await getDb()).collection<UserRecord>("users");

  await users.createIndex({ googleSubject: 1 }, { unique: true, sparse: true });
  const linked = await users.findOne({ googleSubject: profile.sub });
  let session;
  if (linked) {
    session = await createAuthSession(linked);
  } else {
    const email = profile.email.toLowerCase();
    const matches = await users.find({ email }).collation({ locale: "en", strength: 2 }).limit(2).toArray();
    const [existing] = matches;
    if (matches.length > 1 || (existing && (existing.googleSubject || !existing.password))) {
      throw new HttpError(409, "This email already belongs to a CentsAI account. Sign in using its existing method.");
    }

    try {
      if (existing?.password) {
        if (password === undefined) {
          return NextResponse.json({ status: "password_required" } satisfies GoogleSignInResponse, { headers: privateHeaders });
        }
        if (!(await bcrypt.compare(password, existing.password))) {
          throw new HttpError(401, "Incorrect CentsAI password");
        }
        session = await createAuthSession(existing);
        const result = await users.updateOne(
          { _id: existing._id, password: existing.password, googleSubject: { $exists: false } },
          { $set: { googleSubject: profile.sub } },
        );
        if (!result.matchedCount) throw new HttpError(409, "Account changed. Start Google sign-in again.");
      } else {
        const user: UserRecord = {
          _id: new ObjectId(),
          email,
          username: profile.name || email.slice(0, email.indexOf("@")),
          googleSubject: profile.sub,
        };
        session = await createAuthSession(user);
        await users.createIndex({ email: 1 }, { unique: true });
        await users.insertOne(user);
      }
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new HttpError(409, "Account changed. Start Google sign-in again.");
      }
      throw error;
    }
  }

  const response = NextResponse.json({ status: "signed_in", session } satisfies GoogleSignInResponse, { headers: privateHeaders });
  writeCookie(response, callback, handoff, "");
  return response;
});
