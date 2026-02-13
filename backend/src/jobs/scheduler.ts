export type JobHandler = () => Promise<void>;

export type ScheduledJob = {
  name: string;
  intervalMs: number;
  handler: JobHandler;
};

const jobs: ScheduledJob[] = [];
const inFlight = new Map<string, boolean>();

export function registerJob(job: ScheduledJob) {
  jobs.push(job);
}

export function startScheduler() {
  for (const job of jobs) {
    setInterval(async () => {
      if (inFlight.get(job.name)) {
        return;
      }
      inFlight.set(job.name, true);
      try {
        await job.handler();
      } catch (error) {
        console.error(`Job ${job.name} failed: ${String(error)}`);
      } finally {
        inFlight.set(job.name, false);
      }
    }, job.intervalMs);
  }
}

export function listJobs() {
  return [...jobs];
}
