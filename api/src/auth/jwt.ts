import jwt from "jsonwebtoken";
import { config } from "../config.js";

/** Name of the httpOnly cookie carrying the session JWT. */
export const AUTH_COOKIE_NAME = "planner_token";

const TOKEN_TTL = "1h";

export interface AuthTokenPayload {
  id: number;
  email: string;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: TOKEN_TTL });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, config.jwtSecret);
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof (decoded as Record<string, unknown>).id !== "number" ||
    typeof (decoded as Record<string, unknown>).email !== "string"
  ) {
    throw new Error("Malformed auth token payload");
  }
  return { id: (decoded as AuthTokenPayload).id, email: (decoded as AuthTokenPayload).email };
}

/** Options shared by the cookie that's set on login and cleared on logout. */
export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
  };
}
