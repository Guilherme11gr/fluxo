import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth/session";
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

  return <DashboardShell>{children}</DashboardShell>;
}
