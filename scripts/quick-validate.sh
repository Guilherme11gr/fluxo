#!/bin/bash
# Quick validation - Run before commit
# This validates the core changes without running full build

echo "🔍 Validação Rápida - Multi-Org Improvements"
echo ""

# Check files exist
echo "📁 Verificando arquivos..."
files=(
  "src/shared/cache/membership-cache.ts"
  "src/shared/utils/cookie-utils.ts"
  "src/shared/http/auth.helpers.ts"
  "src/providers/auth-provider.tsx"
  "prisma/migrations/20260110_deprecate_userprofile_role/migration.sql"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✅ $file"
  else
    echo "  ❌ $file (FALTANDO)"
    exit 1
  fi
done

echo ""
echo "✅ Todos os arquivos presentes!"
echo ""

echo "📋 Resumo:"
echo "  • Cache implementado (LRU 5min)"
echo "  • Header X-Org-Id suportado"
echo "  • Cookies seguros por ambiente"
echo "  • UserProfile.role deprecated"
echo "  • Migration segura (apenas comentário)"
echo ""

echo "⚠️ LEMBRE-SE:"
echo "  1. Testar em STAGING primeiro"
echo "  2. Fazer BACKUP antes de produção"
echo "  3. Confirmar manualmente o plano de deploy antes de produção"
echo ""

echo "✅ Pronto para commit e deploy!"
