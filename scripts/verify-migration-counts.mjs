import process from "node:process";
import pg from "pg";

const { Pool } = pg;

const sourceDatabaseUrl = process.env.FROM_DATABASE_URL?.trim();
const targetDatabaseUrl = process.env.TO_DATABASE_URL?.trim();

if (!sourceDatabaseUrl || !targetDatabaseUrl) {
  console.error(
    "Error: define FROM_DATABASE_URL e TO_DATABASE_URL para validar as contagens.",
  );
  process.exit(1);
}

const tables = [
  "auth.users",
  "public.organizations",
  "public.user_profiles",
  "public.org_memberships",
  "public.projects",
  "public.project_docs",
  "public.epics",
  "public.features",
  "public.tasks",
  "public.invites",
  "public.audit_logs",
];

async function getCounts(pool) {
  const counts = new Map();

  for (const table of tables) {
    const [schema, name] = table.split(".");
    const result = await pool.query(
      `SELECT COUNT(*)::bigint AS count FROM "${schema}"."${name}"`,
    );
    counts.set(table, Number(result.rows[0]?.count ?? 0));
  }

  return counts;
}

async function main() {
  const sourcePool = new Pool({ connectionString: sourceDatabaseUrl });
  const targetPool = new Pool({ connectionString: targetDatabaseUrl });

  try {
    const [sourceCounts, targetCounts] = await Promise.all([
      getCounts(sourcePool),
      getCounts(targetPool),
    ]);

    let hasMismatch = false;

    for (const table of tables) {
      const source = sourceCounts.get(table) ?? 0;
      const target = targetCounts.get(table) ?? 0;
      const status = source === target ? "ok" : "mismatch";

      console.log(
        `${status.padEnd(8)} ${table.padEnd(24)} source=${source} target=${target}`,
      );

      if (source !== target) {
        hasMismatch = true;
      }
    }

    if (hasMismatch) {
      process.exit(1);
    }
  } finally {
    await Promise.all([sourcePool.end(), targetPool.end()]);
  }
}

main().catch((error) => {
  console.error("[verify-migration-counts] falhou:", error);
  process.exit(1);
});
