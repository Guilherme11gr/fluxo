/**
 * Cleanup Realtime Connections
 *
 * Forces all connected clients to disconnect and reconnect cleanly.
 * This helps free up Supabase quota when connection limit is reached.
 *
 * Usage:
 *   npm run realtime:cleanup
 *   # or
 *   ADMIN_SECRET=your-secret npx tsx scripts/cleanup-connections.ts
 */

const ADMIN_API_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3005';
const ADMIN_SECRET = process.env.ADMIN_SECRET;

async function main() {
  if (!ADMIN_SECRET) {
    console.error('❌ ADMIN_SECRET not set in .env.local');
    console.log('\nAdd this to your .env.local:');
    console.log('ADMIN_SECRET=your-admin-secret-here');
    console.log('\nGenerate a secure secret with:');
    console.log('  openssl rand -base64 32');
    process.exit(1);
  }

  console.log('🧹 Realtime Connection Cleanup');
  console.log('='.repeat(40));
  console.log(`📍 API URL: ${ADMIN_API_URL}`);
  console.log('');

  try {
    // Trigger cleanup broadcast
    console.log('📡 Broadcasting force_reconnect command...');
    const response = await fetch(`${ADMIN_API_URL}/api/admin/realtime/connections`, {
      method: 'POST',
      headers: {
        'x-admin-secret': ADMIN_SECRET,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'cleanup',
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.error('❌ Unauthorized: Check ADMIN_SECRET in .env.local');
      } else {
        console.error('❌ Failed:', await response.text());
      }
      process.exit(1);
    }

    const result = await response.json();
    console.log('✅ Cleanup broadcast sent!');
    console.log(`   Timestamp: ${result.timestamp}`);
    console.log('');
    console.log('💡 What happens next:');
    console.log('   1. All clients receive the force_reconnect command');
    console.log('   2. Clients disconnect cleanly (freeing quota)');
    console.log('   3. Clients reconnect with exponential backoff');
    console.log('   4. Zombie connections are eliminated');
    console.log('');
    console.log('⏳ Reconnection timeline:');
    console.log('   - Attempt 1: ~1s');
    console.log('   - Attempt 2: ~2s');
    console.log('   - Attempt 3: ~4s');
    console.log('   - ... up to 30s');
    console.log('');
    console.log('✅ Cleanup complete!');

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ Error:', message);
    const errorCode = (error as { code?: string }).code;
    if (errorCode === 'ECONNREFUSED') {
      console.log('\n💡 Make sure the dev server is running:');
      console.log('   npm run dev');
    }
    process.exit(1);
  }
}

main();
