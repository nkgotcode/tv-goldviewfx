import { runDataGapMonitor } from "../services/data_gap_service";

export async function runDataGapMonitorJob() {
  return runDataGapMonitor();
}
