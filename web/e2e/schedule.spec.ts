import { expect, test } from "@playwright/test";
import { addTask, createProject, newUser, register } from "./helpers";

test("create project, add tasks and a dependency, see duration and critical path", async ({ page }) => {
  await register(page, newUser("sched"));
  const name = `Schedule ${Date.now()}`;
  await createProject(page, name);

  await expect(page.getByText("No tasks yet.")).toBeVisible();
  await expect(page.getByText("Project duration: 0 weeks")).toBeVisible();

  await addTask(page, "Design", 2);
  await addTask(page, "Build", 3);

  // Independent tasks run in parallel: 3 weeks, only the longest is critical.
  await expect(page.getByText("Project duration: 3 weeks · Critical tasks: 1")).toBeVisible();

  await page.getByLabel("Add dependency for Build").selectOption({ label: "Design" });

  await expect(page.getByText("Project duration: 5 weeks · Critical tasks: 2")).toBeVisible();
  const buildRow = page.getByRole("row", { name: /Build/ });
  await expect(buildRow).toContainText("Design"); // dependency chip
  await expect(buildRow).toContainText("critical");
  await expect(buildRow.getByRole("cell").nth(4)).toHaveText("2"); // starts after Design

  const gantt = page.getByRole("img", { name: "Gantt chart of the schedule" });
  await expect(gantt.locator(".bar.critical")).toHaveCount(2);
  await expect(gantt.locator('[title="Design: weeks 0–2, float 0"]')).toBeVisible();
  await expect(gantt.locator('[title="Build: weeks 2–5, float 0"]')).toBeVisible();

  // Removing the dependency restores the parallel schedule.
  await buildRow.getByRole("button", { name: "Remove dependency" }).click();
  await expect(page.getByText("Project duration: 3 weeks · Critical tasks: 1")).toBeVisible();

  // The project is listed on the home page.
  await page.getByRole("link", { name: "← Projects" }).click();
  await expect(page.getByRole("link", { name })).toBeVisible();
});
