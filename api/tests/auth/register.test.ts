import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../src/server.js";
import { pool } from "../../src/db/pool.js";

const EMAIL = "register-test@example.com";
const PASSWORD = "correct-horse-battery";

async function cleanup() {
  await pool.query("DELETE FROM users WHERE email = $1", [EMAIL]);
}

describe("POST /auth/register", () => {
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it("registers a new user and never stores the plaintext password", async () => {
    const res = await request(app).post("/auth/register").send({
      email: EMAIL,
      password: PASSWORD,
      name: "Register Test",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: EMAIL, name: "Register Test" });
    expect(res.body.password).toBeUndefined();
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.password_hash).toBeUndefined();

    const { rows: [row] } = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE email = $1",
      [EMAIL],
    );
    expect(row).toBeDefined();
    expect(row.password_hash).not.toBe(PASSWORD);
    expect(row.password_hash.length).toBeGreaterThan(0);
    // argon2 hashes are self-describing, e.g. $argon2id$v=19$...
    expect(row.password_hash.startsWith("$argon2")).toBe(true);
  });

  it("rejects a duplicate email with a 4xx and the shared error shape", async () => {
    const first = await request(app).post("/auth/register").send({
      email: EMAIL,
      password: PASSWORD,
      name: "Register Test",
    });
    expect(first.status).toBe(201);

    const second = await request(app).post("/auth/register").send({
      email: EMAIL,
      password: PASSWORD,
      name: "Someone Else",
    });

    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(second.status).toBeLessThan(500);
    expect(second.body).toHaveProperty("error");
    expect(second.body.error).toHaveProperty("code");
    expect(second.body.error).toHaveProperty("message");
  });

  it("rejects an invalid email and a too-short password", async () => {
    const res = await request(app).post("/auth/register").send({
      email: "not-an-email",
      password: "short",
      name: "Someone",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty("code");
    expect(res.body.error).toHaveProperty("message");
  });
});
