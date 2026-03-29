import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { AppAuthSession, AppAuthUser } from "@/shared/types/auth.types";

type BetterAuthSessionPayload = {
  user?: Record<string, unknown> | null;
  session?: Record<string, unknown> | null;
} | null;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

export function mapAuthUser(user: unknown): AppAuthUser | null {
  if (!user || typeof user !== "object") {
    return null;
  }

  const source = user as Record<string, unknown>;
  const userMetadata = asRecord(source.userMetadata);
  const appMetadata = asRecord(source.appMetadata);

  return {
    id: String(source.id),
    email: typeof source.email === "string" ? source.email : null,
    name: typeof source.name === "string" ? source.name : null,
    image: typeof source.image === "string" ? source.image : null,
    emailVerified: Boolean(source.emailVerified),
    forcePasswordReset: Boolean(source.forcePasswordReset),
    user_metadata: userMetadata,
    app_metadata: appMetadata,
  };
}

export function mapAuthSession(payload: BetterAuthSessionPayload): AppAuthSession | null {
  if (!payload?.user) {
    return null;
  }

  const user = mapAuthUser(payload.user);
  if (!user) {
    return null;
  }

  const session = payload.session && typeof payload.session === "object"
    ? payload.session as Record<string, unknown>
    : null;

  return {
    user,
    session: session
      ? {
          id: String(session.id),
          token: typeof session.token === "string" ? session.token : null,
          expiresAt: typeof session.expiresAt === "string"
            ? session.expiresAt
            : session.expiresAt instanceof Date
              ? session.expiresAt.toISOString()
              : null,
        }
      : null,
  };
}

export async function getServerAuthSession(): Promise<AppAuthSession | null> {
  const headerStore = await headers();
  const session = await auth.api.getSession({
    headers: headerStore,
  });

  return mapAuthSession(session as BetterAuthSessionPayload);
}
