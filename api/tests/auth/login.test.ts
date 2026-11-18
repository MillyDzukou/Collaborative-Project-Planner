import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../src/server.js";
import { pool } from "../../src/db/pool.js";
import { AUTH_COOKIE_NAME } from "../../src/auth/index.js";

const EMAIL = "login-test@example.com";
const PASSWORD = "correct-horse-battery";
const WRONG_PASSWORD = "wrong-horse-battery";

async function cleanup() {
  await pool.query("DELETE FROM users WHERE email = $1", [EMAIL]);
}

describe("POST /auth/login", () => {
  beforeAll(async () => {
    await cleanup();
    const res = await request(app).post("/auth/register").send({
      email: EMAIL,
      password: PASSWORD,
      name: "Login Test",
    });
    expect(res.status).toBe(201);
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it("logs in with correct credentials and sets the auth cookie", async () => {
    const res = await request(app).post("/auth/login").send({
      email: EMAIL,
      password: PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: EMAIL });

    const setCookieHeader = res.headers["set-cookie"];
    expect(setCookieHeader).toBeDefined();
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    const authCookie = cookies.find((c: string) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
    expect(authCookie).toBeDefined();
    expect(authCookie).toMatch(/HttpOnly/i);
    expect(authCookie).toMatch(/SameSite=Lax/i);
  });

  it("returns the same generic error for a wrong password as for a nonexistent email", async () => {
    const wrongPasswordRes = await request(app).post("/auth/login").send({
      email: EMAIL,
      password: WRONG_PASSWORD,
    });

    const noSuchUserRes = await request(app).post("/auth/login").send({
      email: "no-such-user@example.com",
      password: WRONG_PASSWORD,
    });

    expect(wrongPasswordRes.status).toBe(401);
    expect(noSuchUserRes.status).toBe(401);
    expect(wrongPasswordRes.body).toEqual(noSuchUserRes.body);
    expect(wrongPasswordRes.body.error).toHaveProperty("code");
    expect(wrongPasswordRes.body.error).toHaveProperty("message");
  });
});
