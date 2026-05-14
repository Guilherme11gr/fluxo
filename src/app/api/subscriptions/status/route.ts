import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { getTrialStatus } from '@/lib/auth/trial-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        { hasSubscription: false, isInTrial: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const { tenantId } = await extractAuthenticatedTenant(supabase);
    const trialStatus = await getTrialStatus(tenantId);

    if (!trialStatus) {
      return NextResponse.json(
        { hasSubscription: false, isInTrial: false, error: 'Organization not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      hasSubscription: trialStatus.hasActiveSubscription,
      isInTrial: trialStatus.isInTrial,
      trialDaysRemaining: trialStatus.trialDaysRemaining,
      trialEndDate: trialStatus.trialEndDate.toISOString(),
      subscriptionStatus: trialStatus.subscriptionStatus,
    });
  } catch (error) {
    console.error('[Subscription Status] Error:', error);
    return NextResponse.json(
      { hasSubscription: false, isInTrial: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
