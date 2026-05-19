export default function RunnerSmokeIsolatedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Runner Smoke Isolated</h1>
        <p className="text-muted-foreground">
          Validating fluxo-runner.updated.exe — {new Date().toISOString()}
        </p>
      </div>
    </div>
  );
}
