"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Zap } from "lucide-react";
import { getSession, signIn } from "@/lib/auth-client";

function LoginContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    const message = searchParams.get("message");
    const error = searchParams.get("error");

    if (message === "check-email") {
      toast.info("Verifique seu email para confirmar sua conta!");
    }
    
    // Handle all possible callback errors
    if (error === "auth-callback-error") {
      toast.error("Erro ao confirmar conta. Tente novamente.");
    } else if (error === "invite-accept-failed") {
      toast.error("Erro ao aceitar convite. O convite pode ter expirado.", {
        description: "Solicite um novo convite ao administrador.",
        duration: 8000,
      });
    } else if (error === "slug-generation-failed") {
      toast.error("Erro ao criar organização. Tente novamente.", {
        description: "Se o problema persistir, entre em contato com o suporte.",
        duration: 8000,
      });
    } else if (error) {
      // Generic error fallback
      toast.error("Ocorreu um erro. Tente novamente.");
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await signIn.email({
        email,
        password,
        rememberMe: true,
      });

      if (result.error) {
        toast.error("Erro ao fazer login: " + result.error.message);
        return;
      }

      toast.success("Login realizado com sucesso!");

      const session = await getSession();
      const mustResetPassword = Boolean(
        (session.data?.user as { forcePasswordReset?: boolean } | undefined)?.forcePasswordReset
      );
      const redirect = searchParams.get("redirect");
      const target = mustResetPassword
        ? '/reset-password/required'
        : (redirect && redirect.startsWith('/')) ? redirect : '/dashboard';
      window.location.href = target;
    } catch {
      toast.error("Erro inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mx-auto mb-4">
            <Zap className="w-6 h-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Bem-vindo ao Jira Killer</CardTitle>
          <CardDescription>Faça login para continuar</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Senha</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Entrar
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-muted-foreground">
            Não tem uma conta?{" "}
            <Link href="/signup" className="text-primary hover:underline">
              Criar conta
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-muted/40">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
