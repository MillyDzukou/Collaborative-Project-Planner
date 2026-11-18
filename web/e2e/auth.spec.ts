import { expect, test } from "@playwright/test";
import { newUser, register } from "./helpers";

test("sign up, log out, and log back in", async ({ page }) => {
  const user = newUser("auth");
  await register(page, user);
  await expect(page.getByText(user.name)).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();

  // Wrong password is rejected.
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();

  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();
  await expect(page.getByText(user.name)).toBeVisible();

  // Session survives a reload (httpOnly cookie).
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();
});
