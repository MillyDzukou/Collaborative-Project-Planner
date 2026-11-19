import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests in tests/tasks hit a real Postgres instance and
    // TRUNCATE shared tables in beforeEach. Running test files in parallel
    // would let one file's reset wipe out another file's in-flight data, so
    // force test files to run sequentially.
    fileParallelism: false,
    // Many tests and beforeAll hooks create users, which runs argon2 (deliberately CPU-heavy). On a
    // loaded laptop or a shared CI runner that can exceed the 5 s / 10 s defaults and cause flaky
    // "Hook timed out" failures, so allow generous time.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
