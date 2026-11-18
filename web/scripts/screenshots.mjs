// Regenerates the README screenshots in docs/screenshots from a running stack seeded with the demo account.
//
//   (stack up on http://localhost:8080 and `node dist/db/seedDemo.js` run, see docs/deployment.md)
//   cd web && DEMO_PASSWORD=... node scripts/screenshots.mjs
//
// Env: BASE_URL (default http://localhost:8080), DEMO_EMAIL (default demo@planner.example), DEMO_PASSWORD (required).
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8080";
const EMAIL = process.env.DEMO_EMAIL ?? "demo@planner.example";
const PASSWORD = process.env.DEMO_PASSWORD;
if (!PASSWORD) throw new Error("DEMO_PASSWORD is required");

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/screenshots");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

async function login(page) {
  await page.goto(BASE_URL);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByRole("heading", { name: "Your projects" }).waitFor({ timeout: 20_000 });
}

async function openBoard(page) {
  await page.getByRole("link", { name: "Product launch (demo)" }).click();
  await page.getByText("● Live").waitFor({ timeout: 15_000 });
  await page.getByText(/Project duration:/).waitFor();
  await page.locator(".gantt").waitFor();
}

// Desktop
{
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(BASE_URL);
  await page.screenshot({ path: path.join(out, "01-login.png") });
  await login(page);
  await page.screenshot({ path: path.join(out, "02-projects.png") });
  await openBoard(page);
  await page.screenshot({ path: path.join(out, "03-board.png"), fullPage: true });
  await ctx.close();
}

// Mobile
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await login(page);
  await openBoard(page);
  await page.screenshot({ path: path.join(out, "04-board-mobile.png"), fullPage: true });
  await ctx.close();
}

await browser.close();
console.log(`Screenshots written to ${out}`);
