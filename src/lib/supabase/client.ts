import { authClient, getSession, signIn, signOut, signUp } from '@/lib/auth-client';

type AuthChangeEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED';

function mapSessionPayload(payload: Awaited<ReturnType<typeof getSession>>['data']) {
  if (!payload?.user) {
    return null;
  }

  return {
    user: {
      id: payload.user.id,
      email: payload.user.email,
      user_metadata: payload.user.userMetadata ?? {},
      app_metadata: payload.user.appMetadata ?? {},
      forcePasswordReset: payload.user.forcePasswordReset ?? false,
    },
    access_token: payload.session?.token ?? null,
    expires_at: payload.session?.expiresAt ?? null,
  };
}

const noopSubscription = {
  unsubscribe() {},
};

export function createClient() {
  return {
    auth: {
      async getSession() {
        const result = await getSession();
        return {
          data: {
            session: mapSessionPayload(result.data),
          },
          error: result.error ?? null,
        };
      },
      async getUser() {
        const result = await getSession();
        return {
          data: {
            user: mapSessionPayload(result.data)?.user ?? null,
          },
          error: result.error ?? null,
        };
      },
      async signInWithPassword({
        email,
        password,
      }: {
        email: string;
        password: string;
      }) {
        const result = await signIn.email({
          email,
          password,
          rememberMe: true,
        });

        return {
          data: result.data ?? null,
          error: result.error ?? null,
        };
      },
      async signUp({
        email,
        password,
        options,
      }: {
        email: string;
        password: string;
        options?: {
          data?: Record<string, unknown>;
        };
      }) {
        const metadata = options?.data ?? {};
        const displayName = typeof metadata.display_name === 'string'
          ? metadata.display_name
          : email.split('@')[0];
        const image = typeof metadata.avatar_url === 'string' ? metadata.avatar_url : undefined;

        const result = await signUp.email({
          email,
          password,
          name: displayName,
          image,
        });

        return {
          data: result.data ?? null,
          error: result.error ?? null,
        };
      },
      async signOut() {
        const result = await signOut();
        return {
          error: result.error ?? null,
        };
      },
      onAuthStateChange(
        _callback: (event: AuthChangeEvent, session: ReturnType<typeof mapSessionPayload>) => void
      ) {
        return {
          data: {
            subscription: noopSubscription,
          },
        };
      },
    },
    channel() {
      throw new Error('Supabase Realtime foi desabilitado nesta stack.');
    },
    removeChannel() {
      return Promise.resolve('ok');
    },
    removeAllChannels() {
      return Promise.resolve([]);
    },
    realtime: authClient,
  };
}
