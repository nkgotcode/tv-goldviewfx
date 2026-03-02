import { listIngestionRuns, markIngestionRunFailed } from "../src/db/repositories/ingestion_runs";
import { loadEnv } from "../src/config/env";

async function run() {
    loadEnv();
    try {
        console.log("Fetching running locks...");
        let hasMore = true;
        let page = 1;
        while (hasMore) {
            const result = await listIngestionRuns({ page, pageSize: 100 });
            const runs = result.data;
            if (runs.length === 0) break;

            const promises = [];
            for (const r of runs) {
                if (r.status === "running") {
                    console.log("Clearing stuck lock:", r.id);
                    promises.push(markIngestionRunFailed(r.id, "manually cleared hung lock"));
                }
            }
            if (promises.length > 0) {
                await Promise.all(promises);
            }
            if (runs.length < 100) hasMore = false;
            page++;
        }
        console.log("Done clearing locks.");
        process.exit(0);
    } catch (e) {
        console.error("Failed:", e);
        process.exit(1);
    }
}
run();
