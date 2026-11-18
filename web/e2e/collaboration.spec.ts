import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { addTask, createProject, expectLive, newUserPage, openBoard, type TestUser } from "./helpers";

// One serial block so owner/editor/viewer are registered once (the API rate-limits registration).
test.describe.configure({ mode: "serial" });

test.describe("collaboration", () => {
  let owner: { context: BrowserContext; page: Page; user: TestUser };
  let editor: { context: BrowserContext; page: Page; user: TestUser };
  let viewer: { context: BrowserContext; page: Page; user: TestUser };
  let boardUrl: string;
  let editorBoard: Page;

  test.beforeAll(async ({ browser }) => {
    owner = await newUserPage(browser, "owner");
    editor = await newUserPage(browser, "editor");
    viewer = await newUserPage(browser, "viewer");
    boardUrl = await createProject(owner.page, `Collab ${Date.now()}`);
    await addTask(owner.page, "Shared task", 2);
  });

  test.afterAll(async () => {
    await Promise.all([owner, editor, viewer].map((u) => u?.context.close()));
  });

  async function invite(user: TestUser, role: "editor" | "viewer") {
    await owner.page.getByLabel("Invite email").fill(user.email);
    await owner.page.getByLabel("Role").selectOption(role);
    await owner.page.getByRole("button", { name: "Invite" }).click();
    await expect(owner.page.getByText(`${user.name} (${role})`)).toBeVisible();
  }

  test("invited editor sees the board and edits propagate live in both directions", async () => {
    await invite(editor.user, "editor");
    await expectLive(owner.page);

    editorBoard = await openBoard(editor.context, boardUrl);
    await expect(editorBoard.getByText("Your role:")).toContainText("editor");
    await expect(editorBoard.getByRole("button", { name: "Shared task", exact: true })).toBeVisible();

    // Owner adds a task -> appears for the editor without reload.
    await addTask(owner.page, "From owner", 4);
    await expect(editorBoard.getByRole("button", { name: "From owner", exact: true })).toBeVisible({ timeout: 8_000 });
    await expect(editorBoard.getByText(/Project duration: 4 weeks/)).toBeVisible({ timeout: 8_000 });

    // Editor changes a status -> owner sees it live.
    await editorBoard.getByLabel("Status of Shared task").selectOption("in_progress");
    await expect(owner.page.getByLabel("Status of Shared task")).toHaveValue("in_progress", { timeout: 8_000 });
  });

  test("a viewer can read the board but has no edit controls", async () => {
    await invite(viewer.user, "viewer");
    const page = await openBoard(viewer.context, boardUrl);

    await expect(page.getByText("Your role:")).toContainText("viewer (read-only)");
    await expect(page.getByRole("cell", { name: "Shared task", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "From owner", exact: true })).toBeVisible();
    await expect(page.getByLabel("Task name")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add task" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
    await expect(page.getByLabel("Status of Shared task")).toHaveCount(0);
    await expect(page.getByLabel("Invite email")).toHaveCount(0);

    // Viewer still receives live updates.
    await addTask(owner.page, "Late task", 1);
    await expect(page.getByRole("cell", { name: "Late task", exact: true })).toBeVisible({ timeout: 8_000 });
    await page.close();
  });

  test("a stale edit shows the conflict banner and can be reapplied", async () => {
    const board = editorBoard;
    await expect(board.getByRole("button", { name: "Late task", exact: true })).toBeVisible({ timeout: 8_000 });

    // Keep the editor's board stale: block task list refetches triggered by live events.
    const pattern = "**/projects/*/tasks*";
    const blockTasks = (route: Route) => (route.request().method() === "GET" ? route.abort() : route.continue());
    await board.route(pattern, blockTasks);

    await owner.page.getByRole("button", { name: "Shared task", exact: true }).click();
    await owner.page.locator("td input").fill("Renamed by owner");
    await owner.page.keyboard.press("Enter");
    await expect(owner.page.getByRole("button", { name: "Renamed by owner", exact: true })).toBeVisible();

    // Editor still shows the old name (stale version) and edits its duration.
    await expect(board.getByRole("button", { name: "Shared task", exact: true })).toBeVisible();
    await board.unroute(pattern, blockTasks);
    await board.getByRole("button", { name: "2", exact: true }).click();
    await board.locator("td input").fill("7");
    await board.keyboard.press("Enter");

    const banner = board.getByRole("alert").filter({ hasText: "was changed by someone else" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Renamed by owner");

    await banner.getByRole("button", { name: "Reapply my change" }).click();
    await expect(banner).toBeHidden();
    await expect(board.getByRole("button", { name: "7", exact: true })).toBeVisible();
    await expect(owner.page.getByRole("button", { name: "7", exact: true })).toBeVisible({ timeout: 8_000 });
  });
});
