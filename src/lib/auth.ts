import bcrypt from "bcrypt";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/infra/adapters/prisma";

const BUILD_FALLBACK_BASE_URL = "http://localhost:3000";
const BUILD_FALLBACK_SECRET =
  "build-only-auth-secret-4f06d28a8b8c4c3cbf6e3a21e9b94c61";

function readFirstEnvValue(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function canUseBuildFallbacks() {
  const lifecycleEvent = process.env.npm_lifecycle_event;

  return (
    process.env.NODE_ENV !== "production" ||
    lifecycleEvent === "build" ||
    lifecycleEvent === "vercel-build" ||
    process.env.NEXT_PHASE === "phase-production-build"
  );
}

const configuredBaseURL = readFirstEnvValue([
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_BETTER_AUTH_URL",
  "NEXT_PUBLIC_APP_URL",
]);

const configuredSecret = readFirstEnvValue([
  "BETTER_AUTH_SECRET",
  "AUTH_SECRET",
]);

if (!configuredBaseURL && !canUseBuildFallbacks()) {
  throw new Error(
    "Better Auth requires BETTER_AUTH_URL or NEXT_PUBLIC_BETTER_AUTH_URL at runtime.",
  );
}

if (!configuredSecret && !canUseBuildFallbacks()) {
  throw new Error(
    "Better Auth requires BETTER_AUTH_SECRET or AUTH_SECRET at runtime.",
  );
}

if (configuredSecret && configuredSecret.length < 32 && !canUseBuildFallbacks()) {
  throw new Error(
    "BETTER_AUTH_SECRET must be at least 32 characters long in production.",
  );
}

const resolvedBaseURL = configuredBaseURL || BUILD_FALLBACK_BASE_URL;
const resolvedSecret = configuredSecret || BUILD_FALLBACK_SECRET;

const trustedOrigins = Array.from(
  new Set(
    [
      configuredBaseURL,
      process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
      process.env.NEXT_PUBLIC_APP_URL,
      BUILD_FALLBACK_BASE_URL,
      "http://localhost:3005",
    ].filter((value): value is string => Boolean(value)),
  ),
);

export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: resolvedBaseURL,
  secret: resolvedSecret,
  trustedOrigins,
  plugins: [nextCookies()],
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
  user: {
    modelName: "users",
    fields: {
      name: "name",
      email: "email",
      emailVerified: "emailVerified",
      image: "image",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    additionalFields: {
      userMetadata: {
        type: "json",
        required: false,
        input: false,
        fieldName: "raw_user_meta_data",
      },
      appMetadata: {
        type: "json",
        required: false,
        input: false,
        fieldName: "raw_app_meta_data",
      },
      invitedAt: {
        type: "date",
        required: false,
        input: false,
        fieldName: "invited_at",
      },
      lastSignInAt: {
        type: "date",
        required: false,
        input: false,
        fieldName: "last_sign_in_at",
      },
      forcePasswordReset: {
        type: "boolean",
        required: false,
        input: false,
        defaultValue: false,
        fieldName: "forcePasswordReset",
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    password: {
      hash: async (password) => bcrypt.hash(password, 10),
      verify: async ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },
});
