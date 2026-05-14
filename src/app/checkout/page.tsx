import { redirect } from "next/navigation";
import Link from "next/link";
import { Infinity, ArrowLeft, CreditCard, Clock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getServerAuthSession } from "@/lib/auth/session";
import { extractAuthenticatedTenant } from "@/shared/http/auth.helpers";
import { createClient } from "@/lib/supabase/server";
import { getTrialStatus } from "@/lib/auth/trial-guard";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const session = await getServerAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  let trialDaysRemaining = 0;
  let trialEndDate: Date | null = null;

  try {
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);
    const status = await getTrialStatus(tenantId);

    if (status) {
      trialDaysRemaining = status.trialDaysRemaining;
      trialEndDate = status.trialEndDate;

      if (status.hasActiveSubscription) {
        redirect("/dashboard");
      }
    }
  } catch {
    // Let the page render even if tenant resolution fails
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4">
            <Infinity className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Seu período de teste expirou</h1>
          <p className="text-muted-foreground mt-2">
            Assine um plano para continuar usando o FluXo
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Assinatura necessária
            </CardTitle>
            <CardDescription>
              {trialEndDate ? (
                trialDaysRemaining > 0
                  ? `Seu trial expira em ${trialDaysRemaining} dia${trialDaysRemaining !== 1 ? 's' : ''}. Assine agora para não perder acesso.`
                  : "Seu período de teste de 30 dias encerrou."
              ) : (
                "Entre em contato para ativar sua assinatura."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">Trial de 30 dias</p>
                  <p className="text-xs text-muted-foreground">
                    Acesso completo a todas as funcionalidades
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">Suporte prioritário</p>
                  <p className="text-xs text-muted-foreground">
                    Ajuda dedicada quando precisar
                  </p>
                </div>
              </div>
            </div>

            <Button className="w-full" size="lg" asChild>
              <Link href="mailto:suporte@fluxo.app?subject=Assinatura%20FluXo">
                <CreditCard className="w-4 h-4 mr-2" />
                Falar com suporte para assinar
              </Link>
            </Button>

            <div className="flex justify-center">
              <Link
                href="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                Voltar ao dashboard
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
