import { runTopicClustering } from "../services/topic_clustering";

export async function runTopicClusteringJob() {
  await runTopicClustering("weekly");
  await runTopicClustering("monthly");
}
