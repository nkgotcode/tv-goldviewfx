#!/usr/bin/env node
import { readFileSync } from "node:fs";

function percent(hit, total) {
  if (!Number.isFinite(hit) || !Number.isFinite(total) || total <= 0) return 0;
  return (hit / total) * 100;
}

function parseLcov(content) {
  const records = content
    .split("end_of_record")
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return records.map((record) => {
    const lines = record.split(/\r?\n/);
    let file = "";
    let lineHit = 0;
    let lineTotal = 0;

    for (const line of lines) {
      if (line.startsWith("SF:")) {
        file = line.slice(3);
        continue;
      }
      if (line.startsWith("DA:")) {
        const [, hitsText] = line.slice(3).split(",");
        lineTotal += 1;
        if (Number(hitsText) > 0) {
          lineHit += 1;
        }
      }
    }

    return {
      file,
      lineHit,
      lineTotal,
      linePct: percent(lineHit, lineTotal),
    };
  });
}

function main() {
  const [, , lcovPath, thresholdsPath] = process.argv;
  if (!lcovPath || !thresholdsPath) {
    console.error("Usage: node scripts/check_critical_coverage.mjs <lcov.info> <thresholds.json>");
    process.exit(2);
  }

  const lcovContent = readFileSync(lcovPath, "utf8");
  const thresholds = JSON.parse(readFileSync(thresholdsPath, "utf8"));
  const records = parseLcov(lcovContent);

  const failures = [];
  for (const target of thresholds.files ?? []) {
    const matched = records.find((record) => record.file.endsWith(target.path));
    if (!matched) {
      failures.push(`${target.path}: missing from coverage report`);
      continue;
    }
    const minLines = Number(target.minLines ?? 0);
    if (matched.linePct + 1e-9 < minLines) {
      failures.push(
        `${target.path}: line coverage ${matched.linePct.toFixed(2)}% < required ${minLines.toFixed(2)}%`,
      );
    }
    console.log(
      `[coverage] ${target.path} lines ${matched.linePct.toFixed(2)}% (${matched.lineHit}/${matched.lineTotal})`,
    );
  }

  if (failures.length > 0) {
    console.error("\nCritical coverage gate failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("\nCritical coverage gate passed.");
}

main();
