import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests in tests/tasks hit a real Postgres instance and
    // TRUNCATE shared tables in beforeEach. Running test files in parallel
    // would let one file's reset wipe out another file's in-flight data, so
    // force test files to run sequentially.
    fileParallelism: false,
  },
});
