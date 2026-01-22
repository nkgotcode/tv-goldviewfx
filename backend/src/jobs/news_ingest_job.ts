import { runNewsIngest } from "../services/news_ingest";

export async function runNewsIngestJob() {
  return runNewsIngest("schedule");
}
