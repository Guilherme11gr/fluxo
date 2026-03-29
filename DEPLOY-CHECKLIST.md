# 📋 Checklist de Deploy - Vercel

## ✅ Pré-Deploy (Completo)

- [x] Criar `.env.production.example` com template de variáveis
- [x] Criar `vercel.json` com headers de segurança e cache
- [x] Otimizar `next.config.ts` com standalone output
- [x] Adicionar `postinstall` script no `package.json`
- [x] Testar build local (`npm run build`) → ✅ Sucesso
- [x] Verificar lint (`npm run lint`)
- [x] Verificar typecheck (`npm run typecheck`)
- [x] Criar documentação de deploy (`docs/guides/vercel-deployment.md`)
- [x] Atualizar README.md com seção de Deploy

---

## 🚀 Deploy na Vercel (Próximos Passos)

### 1. Setup do Projeto
- [ ] Criar conta na [Vercel](https://vercel.com) (se não tiver)
- [ ] Conectar repositório GitHub à Vercel
- [ ] Criar novo projeto na Vercel Dashboard

### 2. Configurar Environment Variables
Copiar do Supabase Dashboard e adicionar na Vercel:

#### Supabase (Project Settings → API)
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`

#### Database (Project Settings → Database → Connection Pooling)
- [ ] `DATABASE_URL` (Transaction mode, porta 6543, `?pgbouncer=true`)
- [ ] `DIRECT_URL` (Direct connection, porta 5432)

#### AI API
- [ ] `DEEPSEEK_API_KEY` (copiar do `.env.local`)

**⚠️ NÃO adicionar:**
- ❌ `DEV_MOCK_AUTH` (dev-only, não vai em produção)

### 3. Primeiro Deploy
- [ ] Clicar em **"Deploy"** na Vercel
- [ ] Aguardar build completar (~2-3 minutos)
- [ ] Verificar logs de build (sem erros)
- [ ] Copiar URL de produção

### 4. Smoke Tests
Testar na URL de produção:
- [ ] `/api/health` retorna `{"status":"ok"}`
- [ ] `/login` carrega página de login
- [ ] Login com Supabase Auth funciona
- [ ] `/dashboard` carrega após login
- [ ] PWA: Service Worker ativo (DevTools → Application)

### 5. Configurações Opcionais
- [ ] Habilitar Vercel Analytics (Dashboard → Analytics)
- [ ] Configurar custom domain (se tiver)
- [ ] Configurar branch protection no GitHub
- [ ] Configurar notificações de deploy (Slack/Discord)

### 6. Pós-Deploy
- [ ] Atualizar `docs/planning/project-status.md` → CI/CD ✅
- [ ] Compartilhar URL de produção com time
- [ ] Documentar URL em local seguro
- [ ] Configurar monitoring de uptime (opcional)

---

## 🧪 Comandos de Validação

Antes de fazer deploy, execute localmente:

```bash
# 1. Clean install
rm -rf node_modules .next
npm install

# 2. Build de produção
npm run build

# 3. Lint
npm run lint

# 4. Type checking
npm run typecheck

# 5. Testes (quando existirem)
npm run test
```

**Status esperado:** Todos ✅ (sem erros)

---

## 📊 Métricas de Sucesso

Após deploy, validar:

| Métrica | Target | Status |
|---------|--------|--------|
| **Build Time** | < 3 minutos | ⏳ Aguardando |
| **First Load JS** | < 200 KB | ⏳ Aguardando |
| **Health Check** | 200 OK | ⏳ Aguardando |
| **Login Flow** | Funcional | ⏳ Aguardando |
| **PWA Score** | > 80 | ⏳ Aguardando |

---

## 🚨 Se Algo Der Errado

### Build Failing?
1. Verificar logs na Vercel Dashboard
2. Confirmar todas env vars estão configuradas
3. Testar `npm run build` localmente
4. Verificar versão do Node.js (>=20)

### Database Connection Error?
1. Confirmar `DATABASE_URL` tem `?pgbouncer=true`
2. Verificar porta 6543 (pooler), não 5432
3. Testar conexão no Supabase Dashboard

### Prisma Client Not Found?
1. Confirmar `postinstall` script existe
2. Force rebuild: Vercel Settings → Clear Cache & Rebuild

---

## 📚 Recursos

- [Vercel Dashboard](https://vercel.com/dashboard)
- [Supabase Dashboard](https://supabase.com/dashboard)
- [Guia Completo de Deploy](./docs/guides/vercel-deployment.md)
- [Troubleshooting](./docs/guides/vercel-deployment.md#-troubleshooting)

---

**🎯 Meta:** Deploy funcional em produção até amanhã!
