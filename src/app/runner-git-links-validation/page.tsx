import { getValidationCards, validateCards, RESULT_MARKERS, GIT_POLICIES, BRANCH_NAME_MAX_LENGTH } from '@/shared/utils/runner-git-links-validation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Runner Git Links Validation',
  description: 'Internal validation page for runner semantic git links',
};

const kindLabels: Record<string, string> = {
  branch_naming: 'Branch Naming',
  artifact_link: 'Artifact Link',
  compare_link: 'Compare Link',
  commit_link: 'Commit Link',
  pr_link: 'PR Link',
  policy_rule: 'Policy Rule',
  marker: 'Marker',
};

const kindColors: Record<string, string> = {
  branch_naming: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  artifact_link: 'bg-green-500/10 text-green-500 border-green-500/20',
  compare_link: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  commit_link: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  pr_link: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
  policy_rule: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  marker: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
};

export default function RunnerGitLinksValidationPage() {
  const cards = getValidationCards();
  const validation = validateCards(cards);

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Runner Git Links Validation</h1>
        <p className="text-muted-foreground">
          Semantic git link validation against production runner-go implementation.
        </p>
      </div>

      <div className="grid gap-4 mb-8 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Cards</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{cards.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Validation</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={validation.allValid ? 'default' : 'destructive'}>
              {validation.allValid ? 'All Valid' : 'Issues Found'}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Kinds Covered</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {validation.expectedKinds.length - validation.missingKinds.length}/{validation.expectedKinds.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Git Policies</h2>
        <div className="flex gap-2 flex-wrap">
          {GIT_POLICIES.map((policy) => (
            <Badge key={policy} variant="outline" className="font-mono">
              {policy}
            </Badge>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Output Contract Markers</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {Object.entries(RESULT_MARKERS).map(([key, value]) => (
            <Card key={key}>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground mb-1">{key}</p>
                <code className="text-sm font-mono bg-muted px-2 py-1 rounded">{value}</code>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Constants</h2>
        <div className="grid gap-2 md:grid-cols-3">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">Branch name max length</p>
              <p className="text-lg font-bold">{BRANCH_NAME_MAX_LENGTH} chars</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">Short ID length</p>
              <p className="text-lg font-bold">8 chars</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">Commit title max</p>
              <p className="text-lg font-bold">72 chars</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Validation Cards</h2>
        <div className="grid gap-4">
          {cards.map((card) => (
            <Card key={card.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{card.label}</CardTitle>
                  <Badge
                    variant="outline"
                    className={`text-xs ${kindColors[card.kind] || ''}`}
                  >
                    {kindLabels[card.kind] || card.kind}
                  </Badge>
                  {card.validated && (
                    <Badge variant="secondary" className="text-xs">
                      validated
                    </Badge>
                  )}
                </div>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex gap-4 text-xs text-muted-foreground">
                  {card.example && (
                    <span>
                      Example: <code className="font-mono bg-muted px-1 rounded">{card.example}</code>
                    </span>
                  )}
                  <span>Source: <code className="font-mono">{card.sourceFile}</code></span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {validation.missingKinds.length > 0 && (
        <div className="mt-8 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <h3 className="font-semibold text-destructive mb-2">Missing Kinds</h3>
          <ul className="list-disc list-inside text-sm text-destructive">
            {validation.missingKinds.map((k) => (
              <li key={k}>{kindLabels[k] || k}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
