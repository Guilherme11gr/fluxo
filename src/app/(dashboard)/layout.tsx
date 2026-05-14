import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth/session";
import { extractAuthenticatedTenant } from "@/shared/http/auth.helpers";
import { createClient } from "@/lib/supabase/server";
import { getTrialStatus, shouldBlockAccess } from "@/lib/auth/trial-guard";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  try {
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);
    const trialStatus = await getTrialStatus(tenantId);

    if (trialStatus && shouldBlockAccess(trialStatus)) {
      redirect("/checkout");
    }
  } catch {
    // If tenant resolution fails, let the page handle it
  }

  return <DashboardShell>{children}</DashboardShell>;
}
