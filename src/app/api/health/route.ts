import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();

  const checks = {
    status: 'ok' as 'ok' | 'degraded',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    services: {
      auth: false,
      database: false,
    },
    latency: {
      database: 0,
    },
  };

  try {
    const authClient = await createClient();
    const { error: authError } = await authClient.auth.getSession();
    checks.services.auth = !authError;

    // Check Prisma/Database connection with latency
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.latency.database = Date.now() - dbStart;
    checks.services.database = true;

  } catch (error) {
    console.error('Health check failed:', error);
    checks.status = 'degraded' as const;
  }

  const allHealthy = Object.values(checks.services).every(Boolean);

  return NextResponse.json(checks, {
    status: allHealthy ? 200 : 503,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
