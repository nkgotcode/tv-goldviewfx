import { loadEnv } from "../src/config/env";

async function run() {
    loadEnv();
    try {
        const symbol = "BTC-USDT";
        const interval = "3m";
        let cursor = new Date("2026-03-01T14:00:00.000Z").getTime();
        let oldestEver = cursor;
        const url = new URL("https://open-api.bingx.com/openApi/swap/v3/quote/klines");
        url.searchParams.set("symbol", symbol);
        url.searchParams.set("interval", interval);
        url.searchParams.set("limit", "1440");

        while (true) {
            url.searchParams.set("endTime", cursor.toString());
            const res = await fetch(url.toString(), { timeout: 10000 });
            const data = await res.json();
            if (data.data && data.data.length > 0) {
                const oldestInBatch = Number(data.data[data.data.length - 1].time);
                console.log(`Fetched to: ${new Date(oldestInBatch).toISOString()}`);
                if (oldestInBatch >= cursor) {
                    console.log("Stuck");
                    break;
                }
                cursor = oldestInBatch - 1;
                oldestEver = oldestInBatch;
            } else {
                console.log("No more data from BingX. Absolute oldest is:", new Date(oldestEver).toISOString());
                break;
            }
        }
    } catch (e) {
        console.error("FAIL:", e);
    }
}
run();
