'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authClient, useSession as useBetterAuthSession } from '@/lib/auth-client';
import type { AppAuthSession, AppAuthUser } from '@/shared/types/auth.types';
import { destroyQueryClient, markOrgSwitchPending } from '@/lib/query';

const CURRENT_ORG_COOKIE = 'jt-current-org';

export interface OrgMembership {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  isDefault: boolean;
}

export interface UserProfile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  currentOrgId: string;
  currentRole: 'OWNER' | 'ADMIN' | 'MEMBER';
  memberships: OrgMembership[];
}

export interface AuthState {
  user: AppAuthUser | null;
  profile: UserProfile | null;
  session: AppAuthSession['session'] | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSwitchingOrg: boolean;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  switchOrg: (orgId: string, returnUrl?: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [isSwitchingOrg, setIsSwitchingOrg] = useState(false);
  const { data: sessionData, isPending: isSessionLoading } = useBetterAuthSession();
  const router = useRouter();
  const pathname = usePathname();

  const user = (sessionData?.user ?? null) as AppAuthUser | null;
  const session = (sessionData?.session ?? null) as AppAuthSession['session'] | null;

  const fetchProfile = useCallback(async (): Promise<UserProfile | null> => {
    try {
      const response = await fetch('/api/users/me', {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });

      if (response.status === 401 || response.status === 403) {
        return null;
      }

      if (response.ok) {
        const data = await response.json();
        return data.data as UserProfile;
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }

    return null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncProfile = async () => {
      if (!user) {
        setProfile(null);
        setIsProfileLoading(false);
        return;
      }

      setIsProfileLoading(true);
      const nextProfile = await fetchProfile();

      if (!cancelled) {
        setProfile(nextProfile);
        setIsProfileLoading(false);
      }
    };

    void syncProfile();

    return () => {
      cancelled = true;
    };
  }, [user?.id, fetchProfile, user]);

  useEffect(() => {
    if (!user?.forcePasswordReset) {
      return;
    }

    if (pathname === '/reset-password/required') {
      return;
    }

    if (pathname === '/login' || pathname === '/signup') {
      return;
    }

    router.replace('/reset-password/required');
  }, [pathname, router, user?.forcePasswordReset]);

  const logout = useCallback(async () => {
    destroyQueryClient();
    document.cookie = `${CURRENT_ORG_COOKIE}=; Max-Age=0; Path=/`;
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  }, [router]);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }

    const nextProfile = await fetchProfile();
    setProfile(nextProfile);
  }, [fetchProfile, user]);

  const switchOrg = useCallback(async (orgId: string, returnUrl?: string) => {
    if (profile?.currentOrgId === orgId) {
      return;
    }

    setIsSwitchingOrg(true);

    try {
      markOrgSwitchPending();
      destroyQueryClient();

      const response = await fetch('/api/org/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
        credentials: 'same-origin',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Erro ao trocar de organização');
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      let verified = false;
      let verifyAttempts = 0;
      const maxAttempts = 3;

      while (verifyAttempts < maxAttempts && !verified) {
        const verifyResponse = await fetch('/api/users/me', {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        });

        if (!verifyResponse.ok) {
          throw new Error('Falha ao verificar troca de organização');
        }

        const profileData = await verifyResponse.json();

        if (profileData.data?.currentOrgId === orgId) {
          verified = true;
        } else {
          await new Promise((resolve) => setTimeout(resolve, 200));
          verifyAttempts++;
        }
      }

      const target = returnUrl || '/dashboard';
      const separator = target.includes('?') ? '&' : '?';
      window.location.href = `${target}${separator}_t=${Date.now()}`;
    } catch (error) {
      console.error('[switchOrg] Error:', error);
      setIsSwitchingOrg(false);
      throw error;
    }
  }, [profile?.currentOrgId]);

  const value = useMemo<AuthState>(() => ({
    user,
    profile,
    session,
    isLoading: isSessionLoading || (Boolean(user) && isProfileLoading),
    isAuthenticated: Boolean(user),
    isSwitchingOrg,
    logout,
    refreshProfile,
    switchOrg,
  }), [
    isProfileLoading,
    isSessionLoading,
    isSwitchingOrg,
    logout,
    profile,
    refreshProfile,
    session,
    switchOrg,
    user,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }

  return context;
}
