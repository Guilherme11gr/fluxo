import { RUNNER_VALIDATION_DATA } from '@/shared/utils/runner-validation-copy';

export default function RunnerValidationPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {RUNNER_VALIDATION_DATA.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          Última atualização: {RUNNER_VALIDATION_DATA.lastUpdated}
        </p>
      </div>

      {RUNNER_VALIDATION_DATA.sections.map((section) => (
        <section
          key={section.id}
          className="rounded-lg border border-border bg-card p-6 shadow-sm"
        >
          <div className="mb-4 space-y-1">
            <h2 className="text-xl font-semibold text-card-foreground">
              {section.title}
            </h2>
            <p className="text-sm text-muted-foreground">
              {section.description}
            </p>
          </div>

          <div className="space-y-3">
            {section.checks.map((check) => (
              <div
                key={check.id}
                className="rounded-md border border-border bg-secondary/50 p-4"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-card-foreground">
                      {check.label}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {check.description}
                    </p>
                  </div>
                  <code className="mt-2 inline-flex items-center rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground sm:mt-0">
                    {check.command}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
