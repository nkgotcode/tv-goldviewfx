import { test, expect } from "bun:test";
import { enqueueRetry, processRetryQueue } from "../../src/services/retry_queue_service";
import { listDueRetryQueueItems } from "../../src/db/repositories/retry_queue";

const hasEnv = process.env.DB_TEST_ENABLED === "true";

if (!hasEnv) {
  test.skip("retry queue tests require database configuration", () => {});
} else {
  test("retry queue dedupes by key", async () => {
    const first = await enqueueRetry({
      jobType: "noop",
      payload: { attempt: 1 },
      dedupeKey: "noop:dedupe",
    });
    const second = await enqueueRetry({
      jobType: "noop",
      payload: { attempt: 2 },
      dedupeKey: "noop:dedupe",
    });
    expect(first.id).toBe(second.id);
  });

  test("retry queue processes due items", async () => {
    await enqueueRetry({
      jobType: "noop",
      payload: { test: true },
      dedupeKey: `noop:${Date.now()}`,
    });
    const due = await listDueRetryQueueItems(10);
    expect(due.length).toBeGreaterThan(0);
    const result = await processRetryQueue(10);
    expect(result.processed).toBeGreaterThan(0);
  });
}
