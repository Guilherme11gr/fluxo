"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { changePassword } from "@/lib/auth-client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function RequiredPasswordResetPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (newPassword.length < 8) {
      toast.error("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("A confirmação da nova senha não confere.");
      return;
    }

    setLoading(true);

    try {
      const result = await changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });

      if (result.error) {
        toast.error(result.error.message || "Não foi possível atualizar a senha.");
        return;
      }

      const finalizeResponse = await fetch('/api/account/complete-password-reset', {
        method: 'POST',
      });

      if (!finalizeResponse.ok) {
        toast.error('Senha alterada, mas não foi possível finalizar o fluxo.');
        return;
      }

      toast.success('Senha atualizada com sucesso.');
      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error('Erro inesperado ao atualizar a senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <CardTitle className="text-2xl">Atualize sua senha</CardTitle>
          <CardDescription>
            Para concluir a migração do acesso ao FluXo, confirme sua senha atual e defina uma nova.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Senha atual</label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nova senha</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Confirmar nova senha</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar nova senha
            </Button>
          </form>
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground text-center">
          Essa etapa só aparece uma vez por conta migrada.
        </CardFooter>
      </Card>
    </div>
  );
}
