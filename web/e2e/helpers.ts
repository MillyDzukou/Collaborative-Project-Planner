import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const PASSWORD = "e2e-password-123";
const RUN = Date.now().toString(36);
let counter = 0;

export interface TestUser { name: string; email: string; password: string }

/** Unique per run and per call, so reruns never collide with users from earlier runs. */
export function newUser(label: string): TestUser {
  counter += 1;
  return { name: `E2E ${label}`, email: `e2e-${label}-${RUN}-${counter}@example.test`, password: PASSWORD };
}

/** Registers through the UI; the app logs the new user in automatically. */
export async function register(page: Page, user: TestUser) {
  await page.goto("/");
  await page.getByRole("button", { name: "Need an account? Register" }).click();
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();
}

export async function newUserPage(browser: Browser, label: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const user = newUser(label);
  await register(page, user);
  return { context, page, user };
}

export async function createProject(page: Page, name: string): Promise<string> {
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { name: new RegExp(name) })).toBeVisible();
  return page.url();
}

export async function addTask(page: Page, name: string, weeks: number) {
  await page.getByLabel("Task name").fill(name);
  await page.getByLabel("Duration in weeks").fill(String(weeks));
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
}

export async function expectLive(page: Page) {
  await expect(page.getByText("● Live")).toBeVisible({ timeout: 15_000 });
}

export async function openBoard(context: BrowserContext, url: string) {
  const page = await context.newPage();
  await page.goto(url);
  await expectLive(page);
  return page;
}
