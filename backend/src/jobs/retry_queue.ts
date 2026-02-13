import { processRetryQueue } from "../services/retry_queue_service";

export async function runRetryQueueJob() {
  await processRetryQueue();
}
