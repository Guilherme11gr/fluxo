/**
 * @fileoverview Typed static data for the runner validation diagnostics page.
 * No runtime dependencies — pure constants.
 */

export interface ValidationSection {
  id: string;
  title: string;
  description: string;
  checks: ValidationCheck[];
}

export interface ValidationCheck {
  id: string;
  label: string;
  command: string;
  description: string;
}

export interface RunnerValidationData {
  title: string;
  lastUpdated: string;
  sections: ValidationSection[];
}

export const RUNNER_VALIDATION_DATA: RunnerValidationData = {
  title: 'Runner Hardening — Validation Report',
  lastUpdated: '2026-05-19',
  sections: [
    {
      id: 'build-health',
      title: 'Build Health',
      description: 'Verifica se o build compila sem erros e sem warnings críticos.',
      checks: [
        {
          id: 'build-health-001',
          label: 'TypeScript compilation',
          command: 'npm run typecheck',
          description: 'Garante que todos os arquivos TypeScript compilam sem erros.',
        },
        {
          id: 'build-health-002',
          label: 'Next.js build',
          command: 'npm run build',
          description: 'Build de produção do Next.js deve completar sem falhas.',
        },
      ],
    },
    {
      id: 'test-coverage',
      title: 'Test Coverage',
      description: 'Valida que os testes unitários passam e cobrem o código novo.',
      checks: [
        {
          id: 'test-coverage-001',
          label: 'Unit tests',
          command: 'npm run test',
          description: 'Executa todos os testes com Vitest e verifica que nenhum falha.',
        },
        {
          id: 'test-coverage-002',
          label: 'Coverage threshold',
          command: 'npm run test -- --coverage',
          description: 'Garante cobertura mínima de 80% para arquivos novos.',
        },
      ],
    },
    {
      id: 'lint-format',
      title: 'Lint & Format',
      description: 'Verifica conformidade com regras de estilo e formatação.',
      checks: [
        {
          id: 'lint-format-001',
          label: 'ESLint',
          command: 'npm run lint',
          description: 'Sem erros ou warnings de lint no código modificado.',
        },
        {
          id: 'lint-format-002',
          label: 'Prettier check',
          command: 'npx prettier --check "src/**/*.{ts,tsx}"',
          description: 'Formatação consistente em todos os arquivos TypeScript.',
        },
      ],
    },
    {
      id: 'runtime-safety',
      title: 'Runtime Safety',
      description: 'Confirma que a página de validação não depende de recursos externos.',
      checks: [
        {
          id: 'runtime-safety-001',
          label: 'No network calls',
          command: 'grep -r "fetch\\|axios\\|api/" src/app/runner-validation/',
          description: 'A página não deve fazer chamadas de rede.',
        },
        {
          id: 'runtime-safety-002',
          label: 'No env vars',
          command: 'grep -r "process\\.env" src/app/runner-validation/',
          description: 'A página não deve depender de variáveis de ambiente.',
        },
      ],
    },
  ],
};
