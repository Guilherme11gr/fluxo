'use client';

import Link from "next/link";
import * as React from "react";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Kanban,
  Settings,
  Infinity,
  type LucideIcon,
  Menu,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { LogoutButton } from "@/components/layout/logout-button";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { TaskModalProvider } from "@/providers/task-modal-provider";
import { useAuth } from "@/hooks/use-auth";
import { DashboardAgentChat } from "@/components/layout/dashboard-agent-chat";

export function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { viewer } = useAuth();

  const sidebarItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: FolderKanban, label: "Projetos", href: "/projects" },
    { icon: CheckSquare, label: "Minhas Tasks", href: "/tasks" },
    { icon: Kanban, label: "My Board", href: "/board" },
    { icon: Users, label: "Equipe", href: "/settings/team" },
    { icon: Settings, label: "Configurações", href: "/settings" },
  ];

  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = React.useState(() => {
    if (typeof window !== 'undefined' && viewer?.id && viewer?.currentOrgId) {
      const key = `sidebar-collapsed-${viewer.currentOrgId}-${viewer.id}`;
      const saved = localStorage.getItem(key);
      return saved === 'true';
    }
    return false;
  });

  React.useEffect(() => {
    if (viewer?.id && viewer?.currentOrgId) {
      const key = `sidebar-collapsed-${viewer.currentOrgId}-${viewer.id}`;
      localStorage.setItem(key, String(isDesktopCollapsed));
    }
  }, [isDesktopCollapsed, viewer?.id, viewer?.currentOrgId]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside
        className={`hidden md:flex flex-col border-r border-border bg-card fixed h-full z-30 transition-all duration-300 ${
          isDesktopCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        <div className={`border-b border-border flex items-center ${
          isDesktopCollapsed ? 'p-3 justify-center' : 'p-4 justify-between'
        }`}>
          {isDesktopCollapsed ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsDesktopCollapsed(false)}
              className="h-10 w-10"
              title="Expandir menu"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                  <Infinity className="w-6 h-6 text-primary-foreground" />
                </div>
                <h1 className="text-xl font-bold tracking-tight">
                  FluXo
                </h1>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsDesktopCollapsed(true)}
                className="h-8 w-8"
                title="Recolher menu"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>

        <div className={`border-b border-border ${
          isDesktopCollapsed ? 'px-2 py-2 flex justify-center' : 'px-4 py-3'
        }`}>
          <OrgSwitcher isCollapsed={isDesktopCollapsed} />
        </div>

        <nav className={`flex-1 space-y-1 ${
          isDesktopCollapsed ? 'p-2' : 'p-4'
        }`}>
          {sidebarItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-200 ${
                isDesktopCollapsed ? 'justify-center p-2.5' : 'gap-3 px-4 py-2.5'
              }`}
              title={isDesktopCollapsed ? item.label : undefined}
            >
              <item.icon className={`flex-shrink-0 ${
                isDesktopCollapsed ? 'w-5 h-5' : 'w-4 h-4'
              }`} />
              {!isDesktopCollapsed && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </Link>
          ))}
        </nav>

        <div className={`border-t border-border ${
          isDesktopCollapsed ? 'p-2 flex justify-center' : 'p-4'
        }`}>
          <LogoutButton isCollapsed={isDesktopCollapsed} />
        </div>
      </aside>

      <div className="md:hidden fixed top-0 left-0 right-0 h-16 border-b border-border bg-background z-40 flex items-center px-4 justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
            <Infinity className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg">
            FluXo
          </span>
        </div>
        <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
          <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)}>
            <Menu className="w-6 h-6" />
          </Button>
          <SheetContent side="left" className="w-64 bg-card border-r border-border p-0">
            <div className="p-6 border-b border-border flex items-center gap-2">
              <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
                <Infinity className="w-6 h-6 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-bold tracking-tight">
                FluXo
              </h1>
            </div>
            <div className="px-4 py-3 border-b border-border">
              <OrgSwitcher />
            </div>

            <nav className="flex-1 p-4 space-y-1">
              {sidebarItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsSidebarOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <item.icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{item.label}</span>
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>

      <main
        className={`flex-1 pt-16 md:pt-0 min-h-screen bg-background overflow-x-hidden transition-all duration-300 ${
          isDesktopCollapsed ? 'md:ml-16' : 'md:ml-64'
        }`}
      >
        <div className="p-6 md:p-8 max-w-screen-2xl mx-auto">
          <TaskModalProvider>
            {children}
          </TaskModalProvider>
        </div>
        <DashboardAgentChat />
      </main>
    </div>
  );
}
