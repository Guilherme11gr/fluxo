import { worktreeValidationRows } from '@/shared/utils/runner-worktree-validation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Runner Worktree Validation',
  description: 'Validation checks to ensure the runner operates in the correct worktree.',
};

export default function RunnerWorktreeValidationPage() {
  return (
    <div className="container mx-auto px-6 py-12 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Runner Worktree Validation</h1>
        <p className="text-muted-foreground mt-2">
          Checks that confirm the runner prompt writes to the execution worktree, not the base repo.
        </p>
      </div>

      <div className="grid gap-4">
        {worktreeValidationRows.map((row) => (
          <Card key={row.id}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Badge variant="outline">{row.id}</Badge>
                <CardTitle className="text-lg">{row.label}</CardTitle>
              </div>
              <CardDescription>{row.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium text-muted-foreground">Command: </span>
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{row.command}</code>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Expected: </span>
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{row.expectedPattern}</code>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
