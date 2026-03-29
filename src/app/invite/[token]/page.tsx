"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Users, Shield, AlertCircle } from "lucide-react";
import Link from "next/link";
import { getSession } from "@/lib/auth-client";

interface InviteDetails {
  token: string;
  orgName: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  expiresAt: string;
}

const roleLabels = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  MEMBER: 'Membro',
};

export default function InvitePage() {
  const params = useParams();
  const token = params.token as string;

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Check auth status and fetch invite (in parallel for performance)
  useEffect(() => {
    const checkAuthAndFetchInvite = async () => {
      try {
        const [authResult, inviteResponse] = await Promise.all([
          getSession(),
          fetch(`/api/invites/${token}`),
        ]);

        setIsLoggedIn(!!authResult.data?.user);

        // Process invite result
        const data = await inviteResponse.json();

        if (!inviteResponse.ok) {
          setError(data.error?.message || 'Convite inválido');
          return;
        }

        setInvite(data.data);
      } catch {
        setError('Erro ao carregar convite');
      } finally {
        setLoading(false);
      }
    };

    checkAuthAndFetchInvite();
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);

    try {
      const response = await fetch('/api/account/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteToken: token }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error?.message || 'Erro ao aceitar convite');
        setAccepting(false);
        return;
      }

      const orgId = data.data?.orgId;
      if (orgId) {
        toast.success('Bem-vindo à organização!');
        window.location.href = '/dashboard';
      } else {
        toast.success('Bem-vindo à organização!');
        window.location.href = '/dashboard';
      }
    } catch {
      toast.error('Erro ao aceitar convite');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-12 h-12 bg-destructive/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Convite Inválido</CardTitle>
            <CardDescription>{error || 'Este convite não existe ou expirou.'}</CardDescription>
          </CardHeader>
          <CardFooter className="flex justify-center">
            <Link href="/login">
              <Button variant="outline">Voltar para Login</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Você foi convidado!</CardTitle>
          <CardDescription>
            Você foi convidado para entrar em <strong>{invite.orgName}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Função:</span>
            </div>
            <Badge variant="secondary">{roleLabels[invite.role]}</Badge>
          </div>

          <p className="text-sm text-muted-foreground text-center">
            Este convite expira em{' '}
            {new Date(invite.expiresAt).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          {isLoggedIn ? (
            <Button
              onClick={handleAccept}
              className="w-full"
              disabled={accepting}
            >
              {accepting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Aceitar Convite
            </Button>
          ) : (
            <>
              <Link href={`/signup?invite=${token}`} className="w-full">
                <Button className="w-full">Criar Conta e Entrar</Button>
              </Link>
              <Link href={`/login?redirect=/invite/${token}`} className="w-full">
                <Button variant="outline" className="w-full">Já tenho conta</Button>
              </Link>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
