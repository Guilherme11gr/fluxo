import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/infra/adapters/prisma';

/**
 * GET /api/subscriptions/status
 * 
 * Check if user has an active subscription.
 * Used by checkout page and middleware paywall.
 * 
 * Returns:
 * - hasSubscription: boolean
 * - subscriptionId: string | null
 * - status: 'active' | 'inactive' | 'past_due' | 'canceled' | null
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ 
        hasSubscription: false,
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    // Check if user has active subscription in database
    // For now, we'll use a simple flag in user metadata
    // In production, this should query Stripe or a subscriptions table
    
    const { data: userData, error: userError } = await supabase.auth.getUser();
    
    // Check user metadata for subscription info
    const subscriptionStatus = userData.user?.user_metadata?.subscription_status;
    const hasSubscription = subscriptionStatus === 'active';

    // Log for debugging
    console.log('[Subscription Status] User:', user.id, 'Status:', subscriptionStatus, 'Has:', hasSubscription);

    return NextResponse.json({
      hasSubscription,
      subscriptionId: userData.user?.user_metadata?.subscription_id || null,
      status: subscriptionStatus || null,
    });
  } catch (error) {
    console.error('[Subscription Status] Error:', error);
    return NextResponse.json({ 
      hasSubscription: false,
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
