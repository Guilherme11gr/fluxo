"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";

interface LogoutButtonProps {
  isCollapsed?: boolean;
}

export function LogoutButton({ isCollapsed = false }: LogoutButtonProps) {
  const router = useRouter();

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
    router.refresh();
  };

  if (isCollapsed) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleLogout}
        className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        title="Sair"
      >
        <LogOut className="w-5 h-5" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      onClick={handleLogout}
      className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
    >
      <LogOut className="w-4 h-4" />
      <span className="text-sm">Sair</span>
    </Button>
  );
}
