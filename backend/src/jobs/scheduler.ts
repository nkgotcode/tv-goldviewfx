export type JobHandler = () => Promise<void>;

export type ScheduledJob = {
  name: string;
  intervalMs: number;
  handler: JobHandler;
};

const jobs: ScheduledJob[] = [];

export function registerJob(job: ScheduledJob) {
  jobs.push(job);
}

export function startScheduler() {
  for (const job of jobs) {
    setInterval(async () => {
      try {
        await job.handler();
      } catch (error) {
        console.error(`Job ${job.name} failed: ${String(error)}`);
      }
    }, job.intervalMs);
  }
}

export function listJobs() {
  return [...jobs];
}
