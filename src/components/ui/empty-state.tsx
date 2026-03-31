import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-12 text-center animate-in fade-in-50 duration-500", className)}>
      <div className="relative mb-6">
        <svg
          className="w-48 h-32 text-muted-foreground/10"
          viewBox="0 0 200 140"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="30" y="20" width="140" height="100" rx="12" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4" />
          <rect x="50" y="45" width="60" height="8" rx="4" fill="currentColor" opacity="0.3" />
          <rect x="50" y="62" width="100" height="6" rx="3" fill="currentColor" opacity="0.2" />
          <rect x="50" y="76" width="80" height="6" rx="3" fill="currentColor" opacity="0.2" />
          <rect x="50" y="90" width="45" height="6" rx="3" fill="currentColor" opacity="0.15" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted shadow-sm border border-border">
            <Icon className="w-8 h-8 text-muted-foreground" />
          </div>
        </div>
      </div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-sm mb-6">{description}</p>
      {action && <div className="animate-in fade-in-50 slide-in-from-bottom-2 duration-700 delay-100">{action}</div>}
    </div>
  );
}
