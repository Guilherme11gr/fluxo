import crypto from "node:crypto";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

const sourceDatabaseUrl = process.env.FROM_DATABASE_URL?.trim() || null;
const targetDatabaseUrl =
  process.env.TO_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  null;
const shouldForcePasswordReset = process.env.FORCE_PASSWORD_RESET === "true";

if (!targetDatabaseUrl) {
  console.error(
    "Error: define TO_DATABASE_URL ou DATABASE_URL para migrar auth.users -> Better Auth.",
  );
  process.exit(1);
}

const sourcePool = new Pool({
  connectionString: sourceDatabaseUrl || targetDatabaseUrl,
});

const targetPool = new Pool({
  connectionString: targetDatabaseUrl,
});

function normalizeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function getName(user) {
  const metadata = normalizeObject(user.raw_user_meta_data);
  const identities = Array.isArray(user.identities) ? user.identities : [];
  const primaryIdentity = normalizeObject(identities[0]);
  const identityData = normalizeObject(primaryIdentity.identity_data);

  return (
    metadata.display_name ||
    metadata.full_name ||
    metadata.name ||
    metadata.username ||
    metadata.user_name ||
    identityData.name ||
    identityData.full_name ||
    identityData.username ||
    identityData.preferred_username ||
    (typeof user.email === "string" ? user.email.split("@")[0] : null) ||
    "Usuário"
  );
}

function getImage(user) {
  const metadata = normalizeObject(user.raw_user_meta_data);
  const identities = Array.isArray(user.identities) ? user.identities : [];
  const primaryIdentity = normalizeObject(identities[0]);
  const identityData = normalizeObject(primaryIdentity.identity_data);

  return (
    metadata.avatar_url ||
    metadata.picture ||
    identityData.avatar_url ||
    identityData.picture ||
    null
  );
}

function buildAccounts(user) {
  const accounts = [];
  const identities = Array.isArray(user.identities) ? user.identities : [];

  if (user.encrypted_password) {
    accounts.push({
      id: crypto.randomUUID(),
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: user.encrypted_password,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    });
  }

  for (const identity of identities) {
    if (!identity || identity.provider === "email") {
      continue;
    }

    const identityData = normalizeObject(identity.identity_data);
    const accountId =
      identityData.sub ||
      identity.provider_id ||
      identity.id;

    if (!accountId) {
      continue;
    }

    accounts.push({
      id: crypto.randomUUID(),
      userId: user.id,
      providerId: identity.provider,
      accountId,
      password: null,
      createdAt: identity.created_at || user.created_at,
      updatedAt: identity.updated_at || user.updated_at,
    });
  }

  return accounts;
}

async function loadUsers() {
  const result = await sourcePool.query(`
    SELECT
      u.*,
      COALESCE(
        json_agg(i.* ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL),
        '[]'::json
      ) AS identities
    FROM auth.users u
    LEFT JOIN auth.identities i ON i.user_id = u.id
    WHERE u.deleted_at IS NULL
    GROUP BY u.id
    ORDER BY u.created_at ASC NULLS LAST, u.id ASC
  `);

  return result.rows;
}

async function migrate() {
  const users = await loadUsers();

  console.log(`[auth-migration] ${users.length} usuario(s) encontrados.`);

  const targetClient = await targetPool.connect();

  try {
    await targetClient.query("BEGIN");

    let migratedUsers = 0;
    let migratedAccounts = 0;

    for (const user of users) {
      await targetClient.query(
        `
          UPDATE auth.users
          SET
            name = COALESCE(name, $2),
            image = COALESCE(image, $3),
            email_verified = COALESCE(email_verified, false) OR $4,
            force_password_reset = CASE
              WHEN $5::boolean THEN true
              ELSE force_password_reset
            END
          WHERE id = $1::uuid
        `,
        [
          user.id,
          getName(user),
          getImage(user),
          Boolean(user.email_confirmed_at || user.confirmed_at),
          shouldForcePasswordReset && Boolean(user.encrypted_password),
        ],
      );

      migratedUsers += 1;

      for (const account of buildAccounts(user)) {
        await targetClient.query(
          `
            INSERT INTO public.account (
              id,
              "userId",
              "providerId",
              "accountId",
              password,
              "createdAt",
              "updatedAt"
            )
            VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
            ON CONFLICT ("providerId", "accountId")
            DO UPDATE SET
              "userId" = EXCLUDED."userId",
              password = COALESCE(EXCLUDED.password, public.account.password),
              "updatedAt" = EXCLUDED."updatedAt"
          `,
          [
            account.id,
            account.userId,
            account.providerId,
            account.accountId,
            account.password,
            account.createdAt,
            account.updatedAt,
          ],
        );

        migratedAccounts += 1;
      }
    }

    await targetClient.query("COMMIT");

    console.log(
      `[auth-migration] concluido: ${migratedUsers} usuario(s), ${migratedAccounts} conta(s).`,
    );
  } catch (error) {
    await targetClient.query("ROLLBACK");
    throw error;
  } finally {
    targetClient.release();
    await sourcePool.end();
    await targetPool.end();
  }
}

migrate().catch((error) => {
  console.error("[auth-migration] falhou:", error);
  process.exit(1);
});
