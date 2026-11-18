import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../src/server.js";
import { pool } from "../../src/db/pool.js";
import { AUTH_COOKIE_NAME } from "../../src/auth/index.js";

const EMAIL = "me-test@example.com";
const PASSWORD = "correct-horse-battery";

async function cleanup() {
  await pool.query("DELETE FROM users WHERE email = $1", [EMAIL]);
}

function extractCookieValue(res: request.Response): string {
  const setCookieHeader = res.headers["set-cookie"];
  const cookies: string[] = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const authCookie = cookies.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
  if (!authCookie) throw new Error("auth cookie not found in response");
  // Keep only the "name=value" segment, dropping attributes like Path/HttpOnly.
  return authCookie.split(";")[0] as string;
}

describe("GET /auth/me and POST /auth/logout", () => {
  beforeAll(async () => {
    await cleanup();
    await request(app).post("/auth/register").send({
      email: EMAIL,
      password: PASSWORD,
      name: "Me Test",
    });
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it("returns 401 with no token", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error).toHaveProperty("code");
    expect(res.body.error).toHaveProperty("message");
  });

  it("returns 401 with a garbage token", async () => {
    const res = await request(app).get("/auth/me").set("Cookie", `${AUTH_COOKIE_NAME}=not-a-real-jwt`);
    expect(res.status).toBe(401);
  });

  it("returns the current user when a valid token cookie is presented", async () => {
    const loginRes = await request(app).post("/auth/login").send({ email: EMAIL, password: PASSWORD });
    expect(loginRes.status).toBe(200);
    const cookie = extractCookieValue(loginRes);

    const meRes = await request(app).get("/auth/me").set("Cookie", cookie);
    expect(meRes.status).toBe(200);
    expect(meRes.body).toMatchObject({ email: EMAIL });
  });

  it("logout requires auth and clears the cookie", async () => {
    const unauthed = await request(app).post("/auth/logout");
    expect(unauthed.status).toBe(401);

    const loginRes = await request(app).post("/auth/login").send({ email: EMAIL, password: PASSWORD });
    const cookie = extractCookieValue(loginRes);

    const logoutRes = await request(app).post("/auth/logout").set("Cookie", cookie);
    expect(logoutRes.status).toBe(200);
  });
});
