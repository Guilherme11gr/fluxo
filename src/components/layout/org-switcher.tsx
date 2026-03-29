'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Building2, Check, ChevronDown, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface OrgSwitcherProps {
  isCollapsed?: boolean;
}

export function OrgSwitcher({ isCollapsed = false }: OrgSwitcherProps) {
  const { profile, isLoading, switchOrg } = useAuth();
  const [isSwitching, setIsSwitching] = useState(false);

  if (isLoading) {
    return (
      <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2 px-2'}`}>
        <Skeleton className="h-8 w-8 rounded-md" />
        {!isCollapsed && <Skeleton className="h-4 w-24" />}
      </div>
    );
  }

  if (!profile || !profile.memberships || profile.memberships.length === 0) {
    return null;
  }

  const currentOrg = profile.memberships.find(m => m.orgId === profile.currentOrgId);
  const hasMultipleOrgs = profile.memberships.length > 1;

  const handleSwitchOrg = async (orgId: string) => {
    if (orgId === profile.currentOrgId) return;

    setIsSwitching(true);
    try {
      await switchOrg(orgId);
    } finally {
      setIsSwitching(false);
    }
  };

  // Collapsed mode: icon-only with tooltip
  if (isCollapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            disabled={isSwitching}
            title={currentOrg?.orgName}
          >
            {isSwitching ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Building2 className="w-5 h-5 text-muted-foreground" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" className="w-56">
          {profile.memberships.map((membership) => (
            <DropdownMenuItem
              key={membership.orgId}
              onSelect={() => handleSwitchOrg(membership.orgId)}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <span className="truncate">{membership.orgName}</span>
              </div>
              {membership.orgId === profile.currentOrgId && (
                <Check className="w-4 h-4 text-primary" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // If only one org, just show it without dropdown
  if (!hasMultipleOrgs) {
    return (
      <div className="flex items-center gap-2 px-2 py-1">
        <div className="w-7 h-7 bg-accent rounded-md flex items-center justify-center flex-shrink-0">
          <Building2 className="w-4 h-4 text-muted-foreground" />
        </div>
        <span className="text-sm font-medium truncate">{currentOrg?.orgName}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 px-2 h-auto py-2"
          disabled={isSwitching}
        >
          <div className="w-7 h-7 bg-accent rounded-md flex items-center justify-center flex-shrink-0">
            {isSwitching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Building2 className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
          <span className="text-sm font-medium truncate flex-1 text-left">
            {currentOrg?.orgName}
          </span>
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {profile.memberships.map((membership) => (
          <DropdownMenuItem
            key={membership.orgId}
            onSelect={() => handleSwitchOrg(membership.orgId)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <span className="truncate">{membership.orgName}</span>
            </div>
            {membership.orgId === profile.currentOrgId && (
              <Check className="w-4 h-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
