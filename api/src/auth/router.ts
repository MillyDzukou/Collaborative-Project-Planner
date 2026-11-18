import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { loginSchema, registerSchema } from "./schemas.js";
import { hashPassword, verifyPassword } from "./password.js";
import { AUTH_COOKIE_NAME, authCookieOptions, signAuthToken } from "./jwt.js";
import { AuthError, emailAlreadyRegisteredError, invalidCredentialsError, validationError } from "./errors.js";
import { requireAuth } from "./middleware.js";

export const authRouter = Router();

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  name: string;
}

function sendAuthError(res: Response, err: unknown): void {
  if (err instanceof AuthError) {
    res.status(err.status).json(err.toResponseBody());
    return;
  }
  if (err instanceof z.ZodError) {
    const message = err.issues[0]?.message ?? "Invalid input.";
    res.status(400).json(validationError(message).toResponseBody());
    return;
  }
  throw err;
}

authRouter.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name } = registerSchema.parse(req.body);

    const existing = await pool.query<{ id: number }>("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      throw emailAlreadyRegisteredError();
    }

    const passwordHash = await hashPassword(password);

    const { rows: [user] } = await pool.query<UserRow>(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, password_hash, name`,
      [email, passwordHash, name],
    );

    if (!user) {
      throw new Error("Insert did not return a row");
    }

    res.status(201).json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    sendAuthError(res, err);
  }
});

authRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const { rows: [user] } = await pool.query<UserRow>(
      "SELECT id, email, password_hash, name FROM users WHERE email = $1",
      [email],
    );

    // Always run a hash comparison, even when no user exists, so the
    // response time doesn't leak whether the email is registered.
    const passwordHash = user?.password_hash ?? "$argon2id$v=19$m=65536,t=3,p=4$0000000000000000$00000000000000000000000000000000";
    const passwordMatches = await verifyPassword(passwordHash, password);

    if (!user || !passwordMatches) {
      throw invalidCredentialsError();
    }

    const token = signAuthToken({ id: user.id, email: user.email });
    res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
    res.status(200).json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    sendAuthError(res, err);
  }
});

authRouter.post("/logout", requireAuth, (_req: Request, res: Response) => {
  res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions());
  res.status(200).json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const { rows: [user] } = await pool.query<Pick<UserRow, "id" | "email" | "name">>(
      "SELECT id, email, name FROM users WHERE id = $1",
      [req.user?.id],
    );

    if (!user) {
      throw invalidCredentialsError();
    }

    res.status(200).json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    sendAuthError(res, err);
  }
});
