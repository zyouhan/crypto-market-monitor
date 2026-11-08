
import crypto from "node:crypto";
import type { RequestHandler } from "express";

const COOKIE_NAME = "cmm_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const AUTH_SECRET = process.env.AUTH_SECRET || "";

const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD must be configured");
}

if (Buffer.byteLength(AUTH_SECRET, "utf8") < 32) {
  throw new Error("AUTH_SECRET must contain at least 32 bytes");
}

interface SessionPayload {
  username: string;
  expiresAt: number;
}

function safeCompare(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function sign(value: string): string {
  return crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(value)
    .digest("base64url");
}

function createToken(username: string): string {
  const payload: SessionPayload = {
    username,
    expiresAt: Date.now() + SESSION_MAX_AGE
  };

  const encodedPayload = Buffer
    .from(JSON.stringify(payload))
    .toString("base64url");

  const signature = sign(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function verifyToken(token: string): SessionPayload | null {
  try {
    const parts = token.split(".");

    if (parts.length !== 2) {
      return null;
    }

    const [encodedPayload, signature] = parts;

    const expectedSignature = sign(encodedPayload);

    if (!safeCompare(signature, expectedSignature)) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as SessionPayload;

    if (
      typeof payload.username !== "string" ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }

    if (payload.username !== ADMIN_USERNAME) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function verifyCredentials(
  username: string,
  password: string
): boolean {
  return (
    safeCompare(username, ADMIN_USERNAME) &&
    safeCompare(password, ADMIN_PASSWORD)
  );
}

export function setSessionCookie(
  res: import("express").Response,
  username: string
): void {
  const token = createToken(username);

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE
  });
}

export function clearSessionCookie(
  res: import("express").Response
): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "strict",
    path: "/"
  });
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const token = req.cookies?.[COOKIE_NAME];

  if (typeof token !== "string") {
    res.status(401).json({
      success: false,
      message: "未登录或登录已过期"
    });
    return;
  }

  const session = verifyToken(token);

  if (!session) {
    clearSessionCookie(res);

    res.status(401).json({
      success: false,
      message: "登录已过期，请重新登录"
    });
    return;
  }

  next();
};
