'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Github, ExternalLink, Unplug, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const GITHUB_APP_SLUG = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'fluxo-dev';

interface GitHubRepo {
  id: number;
  full_name: string;
}

interface InstallationResult {
  hasInstallation: boolean;
  installationId?: number;
  repositories?: GitHubRepo[];
}

interface GitHubIntegrationCardProps {
  projectId: string;
  orgId: string;
  githubInstallationId: number | null;
  githubRepoFullName: string | null;
  githubRepoUrl: string | null;
  onUpdate: () => void;
}

export function GitHubIntegrationCard({
  projectId,
  orgId,
  githubInstallationId,
  githubRepoFullName,
  githubRepoUrl,
  onUpdate,
}: GitHubIntegrationCardProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isLoadingInstallations, setIsLoadingInstallations] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [installation, setInstallation] = useState<InstallationResult | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<string>('');

  const isConnected = Boolean(githubInstallationId);
  const isGitHubAppConfigured = Boolean(process.env.NEXT_PUBLIC_GITHUB_APP_ID);

  useEffect(() => {
    setIsConnecting(false);
  }, []);

  useEffect(() => {
    if (isConnected || !isGitHubAppConfigured) return;

    let cancelled = false;

    async function checkInstallation() {
      setIsLoadingInstallations(true);
      try {
        const res = await fetch(`/api/github/installations?orgId=${orgId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setInstallation(data.data);
        }
      } catch {
        // Silently fail - will fall back to install button
      } finally {
        if (!cancelled) {
          setIsLoadingInstallations(false);
        }
      }
    }

    checkInstallation();
    return () => { cancelled = true; };
  }, [isConnected, isGitHubAppConfigured, orgId]);

  const handleConnect = useCallback(async () => {
    if (!isGitHubAppConfigured) {
      toast.error('GitHub App not configured');
      return;
    }

    setIsConnecting(true);

    try {
      const res = await fetch('/api/github/install/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, orgId }),
      });

      if (!res.ok) {
        throw new Error('Failed to generate install state');
      }

      const { state } = await res.json();
      window.location.href = `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new?state=${state}`;
    } catch {
      setIsConnecting(false);
      toast.error('Failed to initiate GitHub connection');
    }
  }, [projectId, orgId, isGitHubAppConfigured]);

  const handleLinkRepo = useCallback(async () => {
    if (!selectedRepo || !installation?.installationId) return;

    setIsLinking(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          installationId: installation.installationId,
          repoFullName: selectedRepo,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to link repository');
      }

      toast.success('GitHub repository linked');
      onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to link repository');
    } finally {
      setIsLinking(false);
    }
  }, [projectId, selectedRepo, installation, onUpdate]);

  const handleDisconnect = useCallback(async () => {
    setIsDisconnecting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/github`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to disconnect');
      }
      toast.success('GitHub disconnected');
      onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to disconnect');
    } finally {
      setIsDisconnecting(false);
    }
  }, [projectId, onUpdate]);

  const handleRepoSelect = useCallback((value: string) => {
    setSelectedRepo(value);
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Github className="w-5 h-5" />
          <CardTitle className="text-lg">GitHub</CardTitle>
        </div>
        <CardDescription>
          Link tasks to GitHub issues and PRs. Use <code className="text-xs bg-muted px-1 rounded">Fixes KEY-123</code> in commits to auto-close.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isConnected ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="outline-success" className="gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Connected
                </Badge>
                {githubRepoFullName && (
                  <a
                    href={githubRepoUrl || `https://github.com/${githubRepoFullName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {githubRepoFullName}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="text-destructive hover:text-destructive"
              >
                {isDisconnecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Unplug className="w-4 h-4 mr-1" />
                    Disconnect
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : isLoadingInstallations ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : installation?.hasInstallation && installation.repositories && installation.repositories.length > 0 ? (
          <div className="flex flex-col py-4 gap-4">
            <p className="text-sm text-muted-foreground text-center">
              Select a repository to link with this project.
            </p>
            <Select value={selectedRepo} onValueChange={handleRepoSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select a repository..." />
              </SelectTrigger>
              <SelectContent>
                {installation.repositories.map((repo) => (
                  <SelectItem key={repo.id} value={repo.full_name}>
                    {repo.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleLinkRepo}
              disabled={!selectedRepo || isLinking}
              className="gap-2"
            >
              {isLinking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Github className="w-4 h-4" />
              )}
              Link Repository
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center py-4 gap-4">
            <p className="text-sm text-muted-foreground text-center">
              Connect a GitHub repository to enable issue & PR linking.
            </p>
            <Button onClick={handleConnect} disabled={isConnecting} className="gap-2">
              {isConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Github className="w-4 h-4" />
              )}
              Connect GitHub
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
