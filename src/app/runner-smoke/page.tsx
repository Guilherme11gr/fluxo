export default function RunnerSmokePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Runner Smoke Test</h1>
        <p className="text-muted-foreground">OK — {new Date().toISOString()}</p>
      </div>
    </div>
  );
}
