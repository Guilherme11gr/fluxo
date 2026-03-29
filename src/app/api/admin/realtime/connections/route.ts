/**
 * Admin API for managing Realtime connections
 *
 * POST /api/admin/realtime/connections/cleanup - Force cleanup zombie connections
 *
 * Usage:
 *   curl -X POST http://localhost:3005/api/admin/realtime/connections/cleanup \
 *     -H "x-admin-secret: your-secret"
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Admin only - check for admin secret
function isAdmin(req: NextRequest): boolean {
  const adminSecret = req.headers.get('x-admin-secret');
  const expectedSecret = process.env.ADMIN_SECRET;

  if (!expectedSecret) {
    console.error('[Admin] ADMIN_SECRET not configured');
    return false;
  }

  return adminSecret === expectedSecret;
}

/**
 * POST /api/admin/realtime/connections/cleanup
 *
 * Forces cleanup of zombie connections by:
 * 1. Broadcasting "force_reconnect" to all channels
 * 2. Clients will receive and disconnect cleanly
 * 3. Clients reconnect with exponential backoff
 *
 * This helps free up Supabase quota when connection limit is reached.
 */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = body.action;

    if (action === 'cleanup') {
      return await handleCleanup();
    } else if (action === 'broadcast') {
      return await handleBroadcast(body);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error: any) {
    console.error('[Admin] Error in POST:', error);
    return NextResponse.json(
      { error: 'Invalid request', message: error.message },
      { status: 400 }
    );
  }
}

/**
 * Handle cleanup - broadcast force_reconnect to all org channels
 *
 * This works by:
 * 1. Creating an admin channel
 * 2. Broadcasting a command that all clients listen for
 * 3. Clients receive the command and disconnect cleanly
 * 4. Clients reconnect with exponential backoff
 *
 * Benefits:
 * - Frees zombie connections
 * - Resets connection quota
 * - Forces clean reconnection
 */
async function handleCleanup() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Create admin channel for broadcast
  const adminChannel = supabase.channel('admin:commands', {
    config: {
      broadcast: { self: false },
    },
  });

  // Subscribe to channel
  await new Promise<void>((resolve, reject) => {
    adminChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        resolve();
      } else if (status === 'CHANNEL_ERROR') {
        reject(new Error('Failed to subscribe to admin channel'));
      }
    });
  });

  // Broadcast force_reconnect command
  await adminChannel.send({
    type: 'broadcast',
    event: 'admin_command',
    payload: {
      command: 'force_reconnect',
      timestamp: new Date().toISOString(),
      reason: 'admin_cleanup',
    },
  });

  // Cleanup admin channel
  adminChannel.unsubscribe();

  return NextResponse.json({
    success: true,
    message: 'Broadcast sent to force reconnect all clients',
    details: 'Clients will disconnect cleanly and reconnect with exponential backoff',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Handle broadcast - send custom admin event to specific org
 *
 * Usage:
 * {
 *   "action": "broadcast",
 *   "orgId": "org-uuid",
 *   "event": "custom_event",
 *   "payload": { ... }
 * }
 */
async function handleBroadcast(body: any) {
  const { orgId, event, payload } = body;

  if (!orgId || !event) {
    return NextResponse.json(
      { error: 'Missing required fields: orgId, event' },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Create temp channel for broadcast
  const channel = supabase.channel(`org:${orgId}`, {
    config: {
      broadcast: { self: false },
    },
  });

  // Subscribe and send
  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.send({
          type: 'broadcast',
          event,
          payload,
        }).then(() => {
          channel.unsubscribe();
          resolve();
        }).catch(reject);
      } else if (status === 'CHANNEL_ERROR') {
        reject(new Error('Failed to subscribe to channel'));
      }
    });
  });

  return NextResponse.json({
    success: true,
    message: `Broadcast sent to org:${orgId}`,
    timestamp: new Date().toISOString(),
  });
}
