'use client';

import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  GitBranch,
  ExternalLink,
  AlertTriangle,
  Lightbulb,
  ListChecks,
  GitPullRequest,
  GitCommitHorizontal,
  Brain,
  Sparkles,
  ArrowRight,
  FilePenLine,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { StructuredResultV1, StructuredResultCheck } from '@/shared/types';

interface ExecutionResultPanelProps {
  result: StructuredResultV1;
}

function SectionTitle({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </div>
  );
}

function CheckStatusIcon({ status }: { status: StructuredResultCheck['status'] }) {
  if (status === 'passed') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (status === 'failed') return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />;
}

function StringList({ items, variant = 'default' }: { items: string[]; variant?: 'default' | 'warning' }) {
  const dotColor =
    variant === 'warning'
      ? 'before:bg-amber-500/60'
      : 'before:bg-muted-foreground/40';
  const textColor =
    variant === 'warning'
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-foreground';

  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li
          key={i}
          className={`text-sm ${textColor} pl-3 relative before:content-[''] before:absolute before:left-0 before:top-2 before:w-1.5 before:h-1.5 before:rounded-full ${dotColor}`}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

const GIT_MODE_LABELS: Record<string, string> = {
  manual: 'Manual',
  'branch-push': 'Branch Push',
  pr: 'Pull Request',
  no_write: 'Somente leitura',
  branch_only: 'Branch',
  branch_commit_pr: 'Branch + PR',
};

function FullLogView({ result }: { result: StructuredResultV1 }) {
  const hasWhatChanged = result.whatChanged && result.whatChanged.length > 0;
  const hasDecisions = result.decisions && result.decisions.length > 0;
  const hasRisks = result.risks && result.risks.length > 0;
  const hasChecks = result.checksRun && result.checksRun.length > 0;
  const hasFiles = result.filesTouched && result.filesTouched.length > 0;
  const hasFollowups = result.followups && result.followups.length > 0;
  const hasGit =
    result.git &&
    (result.git.mode ||
      result.git.prUrl ||
      result.git.branch ||
      (result.git.commitShas && result.git.commitShas.length > 0));
  const hasMemoryCandidates =
    result.memoryCandidates && result.memoryCandidates.length > 0;
  const hasSkillCandidates =
    result.skillCandidates && result.skillCandidates.length > 0;

  const passedChecks =
    result.checksRun?.filter((c) => c.status === 'passed').length ?? 0;
  const failedChecks =
    result.checksRun?.filter((c) => c.status === 'failed').length ?? 0;
  const skippedChecks =
    result.checksRun?.filter((c) => c.status === 'skipped').length ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm text-foreground leading-relaxed">
          {result.summary}
        </div>
        <Badge
          variant="secondary"
          className={`mt-2 ${
            result.status === 'success'
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : result.status === 'failed'
                ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
          }`}
        >
          {result.status === 'success'
            ? 'Sucesso'
            : result.status === 'failed'
              ? 'Falhou'
              : 'Erro'}
        </Badge>
      </div>

      {hasChecks && (
        <>
          <Separator />
          <div>
            <SectionTitle icon={ListChecks}>Checks</SectionTitle>
            <div className="flex items-center gap-3 mb-2">
              {passedChecks > 0 && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  {passedChecks} passed
                </span>
              )}
              {failedChecks > 0 && (
                <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                  {failedChecks} failed
                </span>
              )}
              {skippedChecks > 0 && (
                <span className="text-xs text-muted-foreground font-medium">
                  {skippedChecks} skipped
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {result.checksRun!.map((check, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 text-sm rounded-md px-2.5 py-1.5 ${
                    check.status === 'failed'
                      ? 'bg-red-500/5 dark:bg-red-500/10'
                      : check.status === 'passed'
                        ? 'bg-emerald-500/5 dark:bg-emerald-500/10'
                        : ''
                  }`}
                >
                  <CheckStatusIcon status={check.status} />
                  <div className="flex-1 min-w-0">
                    <span className="text-foreground">{check.name}</span>
                    {check.observed && (
                      <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">
                        observado
                      </Badge>
                    )}
                    {check.details && (
                      <span className="text-muted-foreground ml-1">
                        &mdash; {check.details}
                      </span>
                    )}
                    {(check.command || check.exitCode !== undefined || check.durationMs !== undefined) && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        {check.command && (
                          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                            {check.command}
                          </code>
                        )}
                        {check.exitCode !== undefined && check.exitCode !== null && (
                          <span>exit {check.exitCode}</span>
                        )}
                        {check.durationMs !== undefined && check.durationMs !== null && (
                          <span>{Math.round(check.durationMs / 100) / 10}s</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {hasWhatChanged && (
        <>
          <Separator />
          <div>
            <SectionTitle icon={ArrowRight}>O que mudou</SectionTitle>
            <StringList items={result.whatChanged!} />
          </div>
        </>
      )}

      {hasFiles && (
        <>
          <Separator />
          <div>
            <SectionTitle icon={FilePenLine}>Arquivos alterados</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {result.filesTouched!.map((file, i) => (
                <Badge key={i} variant="outline" className="text-xs font-mono">
                  {file}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}

      {hasDecisions && (
        <>
          <Separator />
          <div>
            <SectionTitle icon={Lightbulb}>Decisões</SectionTitle>
            <StringList items={result.decisions!} />
          </div>
        </>
      )}

      {hasRisks && (
        <>
          <Separator />
          <div>
            <SectionTitle icon={AlertTriangle}>Riscos</SectionTitle>
            <StringList items={result.risks!} variant="warning" />
          </div>
        </>
      )}

      {hasGit && (
        <>
          <Separator />
          <div>
            <SectionTitle icon={GitBranch}>Git</SectionTitle>
            <div className="space-y-1.5 text-sm">
              {result.git!.mode && (
                <div className="flex items-center gap-1.5">
                  <GitCommitHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Modo:</span>
                  <Badge variant="outline" className="text-xs">
                    {GIT_MODE_LABELS[result.git!.mode] ?? result.git!.mode}
                  </Badge>
                </div>
              )}
              {result.git!.branch && (
                <div className="flex items-center gap-1.5">
                  <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                  {result.git!.links?.branch ? (
                    <a
                      href={result.git!.links.branch}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-blue-500 hover:underline inline-flex items-center gap-1"
                    >
                      {result.git!.branch}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="font-mono text-xs">
                      {result.git!.branch}
                    </span>
                  )}
                </div>
              )}
              {result.git!.baseBranch && (
                <div className="text-xs text-muted-foreground pl-5">
                  base: <span className="font-mono">{result.git!.baseBranch}</span>
                </div>
              )}
              {result.git!.commitShas && result.git!.commitShas.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-5">
                  {result.git!.commitShas.map((sha, i) => (
                    result.git!.links?.commits?.[i] ? (
                      <a
                        key={i}
                        href={result.git!.links.commits[i]}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Badge variant="outline" className="text-xs font-mono hover:bg-muted">
                          {sha.slice(0, 7)}
                        </Badge>
                      </a>
                    ) : (
                      <Badge key={i} variant="outline" className="text-xs font-mono">
                        {sha.slice(0, 7)}
                      </Badge>
                    )
                  ))}
                </div>
              )}
              {result.git!.links?.compare && (
                <div className="pl-5">
                  <a
                    href={result.git!.links.compare}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline inline-flex items-center gap-1"
                  >
                    Comparar alterações
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {result.git!.hasVerifiableDelta !== undefined && (
                <div className="flex flex-wrap gap-1.5 pl-5">
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      result.git!.hasVerifiableDelta
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    delta {result.git!.hasVerifiableDelta ? 'verificado' : 'ausente'}
                  </Badge>
                  {result.git!.policyVerified !== undefined && (
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        result.git!.policyVerified
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      policy {result.git!.policyVerified ? 'ok' : 'falhou'}
                    </Badge>
                  )}
                </div>
              )}
              {result.git!.prUrl && (
                <div className="flex items-center gap-1.5">
                  <GitPullRequest className="h-3.5 w-3.5 text-purple-500" />
                  <a
                    href={result.git!.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline inline-flex items-center gap-1"
                  >
                    PR #{result.git!.prNumber ?? '?'}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {hasFollowups && (
        <>
          <Separator />
          <div>
            <SectionTitle icon={ListChecks}>Follow-ups</SectionTitle>
            <StringList items={result.followups!} />
          </div>
        </>
      )}

      {hasMemoryCandidates && (
        <>
          <Separator />
          <div>
            <SectionTitle icon={Brain}>Memória</SectionTitle>
            <StringList items={result.memoryCandidates!} />
          </div>
        </>
      )}

      {hasSkillCandidates && (
        <>
          <Separator />
          <div>
            <SectionTitle icon={Sparkles}>Skills sugeridas</SectionTitle>
            <div className="space-y-1.5">
              {result.skillCandidates!.map((skill, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Sparkles className="h-3.5 w-3.5 text-purple-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-foreground">
                      {skill.name}
                    </span>
                    {skill.reason && (
                      <span className="text-muted-foreground ml-1">
                        &mdash; {skill.reason}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function ExecutionResultPanel({ result }: ExecutionResultPanelProps) {
  return <FullLogView result={result} />;
}
