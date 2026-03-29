import { getServerAuthSession } from '@/lib/auth/session';

export async function createClient() {
  const getSession = async () => {
    const session = await getServerAuthSession();

    return {
      data: { session },
      error: null,
    };
  };

  return {
    auth: {
      async getSession() {
        return getSession();
      },
      async getUser() {
        const result = await getSession();

        return {
          data: {
            user: result.data.session?.user ?? null,
          },
          error: result.error,
        };
      },
    },
  };
}
