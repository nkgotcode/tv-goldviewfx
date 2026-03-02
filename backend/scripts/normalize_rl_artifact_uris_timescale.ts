import { getTimescaleSql } from "../src/db/timescale/client";

type Args = {
  dryRun: boolean;
};

function parseArgs(): Args {
  const args = new Set(process.argv.slice(2));
  return {
    dryRun: args.has("--dry-run"),
  };
}

async function main() {
  const { dryRun } = parseArgs();
  process.env.TIMESCALE_RL_OPS_ENABLED = "true";

  if (!process.env.TIMESCALE_URL) {
    throw new Error("TIMESCALE_URL is required");
  }

  const sql = getTimescaleSql("normalize RL artifact URIs");
  const legacyRows = (await sql`
    select id, artifact_uri
    from model_artifacts
    where artifact_uri like 'convex://storage/%'
    order by created_at asc
  `) as Array<{ id: string; artifact_uri: string }>;

  let updatedArtifacts = 0;
  let updatedAgentVersions = 0;
  let clearedEvaluationReports = 0;

  for (const row of legacyRows) {
    const normalizedUri = `timescale://model_artifacts/${row.id}`;

    if (!dryRun) {
      await sql`
        update model_artifacts
        set artifact_uri = ${normalizedUri}
        where id = ${row.id}
      `;

      const result = await sql`
        update agent_versions
        set artifact_uri = ${normalizedUri}
        where artifact_uri = ${row.artifact_uri}
      `;
      updatedAgentVersions += result.count ?? 0;
    }

    updatedArtifacts += 1;
  }

  const remainingLegacy = (await sql`
    select count(*)::int as count
    from model_artifacts
    where artifact_uri like 'convex://storage/%'
  `) as Array<{ count: number }>;

  if (!dryRun) {
    const cleared = await sql`
      update evaluation_reports
      set artifact_uri = null,
          updated_at = now()
      where artifact_uri like 'convex://storage/%'
    `;
    clearedEvaluationReports = cleared.count ?? 0;
  } else {
    const reportLegacy = (await sql`
      select count(*)::int as count
      from evaluation_reports
      where artifact_uri like 'convex://storage/%'
    `) as Array<{ count: number }>;
    clearedEvaluationReports = reportLegacy[0]?.count ?? 0;
  }

  const remainingLegacyReports = (await sql`
    select count(*)::int as count
    from evaluation_reports
    where artifact_uri like 'convex://storage/%'
  `) as Array<{ count: number }>;

  console.log(
    JSON.stringify(
      {
        action: "normalize_rl_artifact_uris_timescale",
        dryRun,
        scanned_legacy_artifacts: legacyRows.length,
        updated_artifacts: updatedArtifacts,
        updated_agent_versions: updatedAgentVersions,
        remaining_legacy_artifacts: remainingLegacy[0]?.count ?? 0,
        cleared_evaluation_reports: clearedEvaluationReports,
        remaining_legacy_evaluation_reports: remainingLegacyReports[0]?.count ?? 0,
      },
      null,
      2,
    ),
  );

  await sql.end({ timeout: 5 });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Artifact URI normalization failed: ${message}`);
  process.exit(1);
});
