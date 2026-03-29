// User roles in organization
export type UserRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface AppAuthUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  emailVerified: boolean;
  forcePasswordReset: boolean;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
}

export interface AppAuthSession {
  user: AppAuthUser;
  session: {
    id: string;
    token: string | null;
    expiresAt: string | null;
  } | null;
}

// Organization membership info
export interface OrgMembershipInfo {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: UserRole;
  isDefault: boolean;
}

// Authenticated context extracted from session
export interface AuthenticatedTenant {
  userId: string;
  tenantId: string; // current org_id
  memberships: OrgMembershipInfo[]; // all user's orgs
}

// User profile with organization info
export interface UserProfile {
  id: string;
  orgId: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

// Extended user with profile
export interface AuthenticatedUser extends AppAuthUser {
  profile: UserProfile;
}

// Session check result
export type SessionResult =
  | { authenticated: true; user: AuthenticatedUser }
  | { authenticated: false; user: null };
