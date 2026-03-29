---
tags: [deployment, vercel, production]
priority: high
last-updated: 2026-01
---

# 🚀 Guia de Deploy - Vercel

## Visão Geral

Este guia detalha o processo de deploy do **Jira Killer** na plataforma Vercel.

**Stack de Deploy:**
- **Plataforma:** Vercel (Hobby/Free Tier)
- **Framework:** Next.js 16 (App Router + Standalone output)
- **Database:** Supabase PostgreSQL (connection pooling)
- **ORM:** Prisma Client (gerado automaticamente)
- **Build:** Automático via GitHub integration

---

## 📋 Pré-requisitos

Antes de iniciar o deploy, certifique-se de ter:

1. ✅ Conta na [Vercel](https://vercel.com)
2. ✅ Projeto Supabase configurado
3. ✅ Repositório GitHub com o código
4. ✅ Credenciais do banco de dados (Supabase Dashboard)
5. ✅ API Key da Deepseek (para AI Scribe)

---

## 🔧 Passo 1: Configurar Projeto na Vercel

### 1.1 Criar Novo Projeto

1. Acesse [Vercel Dashboard](https://vercel.com/dashboard)
2. Clique em **"Add New Project"**
3. Selecione seu repositório GitHub: `jira-killer`
4. Configure as opções:

| Setting | Valor |
|---------|-------|
| **Framework Preset** | Next.js |
| **Root Directory** | `.` (raiz) |
| **Build Command** | `npm run build` (ou deixe padrão) |
| **Output Directory** | `.next` (detectado automaticamente) |
| **Install Command** | `npm install` (padrão) |

5. **NÃO clique em "Deploy" ainda** — configure variáveis antes

---

## 🔐 Passo 2: Configurar Environment Variables

### 2.1 Obter Credenciais do Supabase

Acesse [Supabase Dashboard](https://supabase.com/dashboard) → Seu Projeto:

**Project Settings → API:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`

**Project Settings → Database → Connection Pooling:**
- `DATABASE_URL` (Transaction mode com `?pgbouncer=true`)
- `DIRECT_URL` (Direct connection, porta 5432)

### 2.2 Adicionar Variáveis na Vercel

No painel de configuração do projeto (antes do primeiro deploy), adicione:

```bash
# ====================================
# SUPABASE (Obrigatório)
# ====================================
NEXT_PUBLIC_SUPABASE_URL=https://kyeajchylsmhiuoslvuo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_...

# ====================================
# DATABASE (Obrigatório para Prisma)
# ====================================
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.xxx:password@aws-0-us-west-2.pooler.supabase.com:5432/postgres

# ====================================
# AI API (Obrigatório para AI Scribe)
# ====================================
DEEPSEEK_API_KEY=sk-fb1b75adc05e4cac851d3efeba66ffc7
```

**⚠️ IMPORTANTE:**
- **NÃO adicionar** `DEV_MOCK_AUTH` (dev-only)
- Marcar todas como **Production + Preview** (ou ajuste conforme necessário)
- Variáveis com `NEXT_PUBLIC_` são expostas no client-side

### 2.3 Validar Variáveis

Após adicionar, clique em **"Deploy"** para iniciar o primeiro build.

---

## 🏗️ Passo 3: Primeiro Deploy

### 3.1 Monitorar Build

Durante o build, a Vercel executará:

```bash
1. npm install
2. npm run postinstall → prisma generate
3. npm run build → next build
4. Deploy .next/standalone
```

### 3.2 Verificar Logs

Se houver erro, verifique nos logs:
- ❌ **Prisma Client error:** Variável `DATABASE_URL` incorreta
- ❌ **Module not found:** Problema no `postinstall`
- ❌ **Build timeout:** Otimizar bundle (já configurado no `next.config.ts`)

### 3.3 Build Bem-Sucedido ✅

Ao final, você verá:
- ✅ **Deployment URL:** `https://jira-killer-xyz.vercel.app`
- ✅ **Status:** Ready
- ✅ **Domain:** Pode configurar custom domain

---

## 🧪 Passo 4: Testar Deployment

### 4.1 Smoke Tests

Acesse a URL de produção e teste:

1. **Health Check:**
   ```bash
   curl https://jira-killer-xyz.vercel.app/api/health
   # Espera: { "status": "ok" }
   ```

2. **Login Page:**
   - Acesse `/login`
   - Verifique se Supabase Auth carrega

3. **Dashboard:**
   - Faça login com usuário real
   - Verifique se dados carregam do Supabase

4. **PWA:**
   - Abra DevTools → Application → Service Workers
   - Verifique se `sw.js` está ativo

### 4.2 Verificar Logs

Vercel Dashboard → Seu Projeto → Logs:
- **Function Logs:** Erros de API routes
- **Build Logs:** Erros de build
- **Edge Logs:** Middleware errors

---

## 🔄 Passo 5: Configurar Deploy Contínuo

### 5.1 GitHub Integration

A Vercel já está integrada ao GitHub. A partir de agora:

**Deploy Automático:**
- `git push origin main` → Deploy em **Production**
- `git push origin feature/xyz` → Deploy em **Preview** (URL temporária)

### 5.2 Branch Protection (Opcional)

Configure no GitHub:
1. Settings → Branches → Add rule
2. Branch name pattern: `main`
3. ✅ Require status checks to pass before merging
4. ✅ Require deployments to succeed before merging

---

## 📊 Passo 6: Monitoramento

### 6.1 Vercel Analytics (Gratuito)

Habilitar em: Vercel Dashboard → Seu Projeto → Analytics

Métricas disponíveis:
- **Web Vitals:** CLS, LCP, FID, TTFB
- **Real User Monitoring (RUM)**
- **Top Pages**
- **Devices & Browsers**

### 6.2 Supabase Monitoring

Acesse Supabase Dashboard → Database:
- **Connection Pool:** Verificar utilização
- **Slow Queries:** Otimizar indexes
- **Error Logs:** Debug de queries

---

## 🚨 Troubleshooting

### Problema 1: Build Timeout (>300s)

**Causa:** Bundle muito grande ou `postinstall` lento

**Solução:**
```typescript
// next.config.ts já configurado com:
output: "standalone", // Reduz bundle size
```

### Problema 2: Prisma Client Não Gerado

**Causa:** `postinstall` não executou

**Solução:**
```json
// package.json (já configurado)
"postinstall": "prisma generate"
```

Ou force rebuild na Vercel: Settings → General → Clear Cache & Rebuild

### Problema 3: Database Connection Failed

**Causa:** URL incorreta ou pooling desabilitado

**Solução:**
- Verificar `DATABASE_URL` tem `?pgbouncer=true`
- Usar porta 6543 (pooler), não 5432 (direct)
- Verificar senha no Supabase Dashboard

### Problema 4: Environment Variables Não Carregam

**Causa:** Variável sem prefixo `NEXT_PUBLIC_` (para client-side)

**Solução:**
- Server-side: Qualquer nome (`DATABASE_URL`, `API_KEY`)
- Client-side: **DEVE** ter `NEXT_PUBLIC_` prefix

### Problema 5: PWA Cache Não Atualiza

**Causa:** Service Worker versão antiga

**Solução:**
```javascript
// public/sw.js
const VERSION = 'v1.0.5'; // Incrementar a cada deploy visual
```

---

## 🔒 Segurança

### Headers de Segurança

Configurados em `vercel.json`:
```json
{
  "headers": [
    { "key": "X-Frame-Options", "value": "DENY" },
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
  ]
}
```

### Secrets Management

- ✅ Nunca commitar `.env` ou `.env.local`
- ✅ Usar Vercel Dashboard para secrets
- ✅ Supabase RLS policies habilitadas
- ✅ API routes validam auth antes de queries

---

## 🔄 Rollback

### Rollback Via Dashboard (Recomendado)

1. Vercel Dashboard → Deployments
2. Selecione deployment anterior (com status ✅)
3. Clique **"Promote to Production"**
4. Confirme → Rollback instantâneo

### Rollback Via CLI

```bash
# Listar deployments
vercel ls

# Fazer rollback para deployment específico
vercel rollback https://jira-killer-xyz.vercel.app
```

### Rollback de Database

⚠️ **Migrations são one-way no Supabase**. Para reverter:
1. Supabase Dashboard → Database → Migrations
2. Executar rollback manual (SQL)
3. Ou restaurar backup

---

## 💰 Custos (Free Tier)

| Recurso | Limite Free | Atual | Status |
|---------|-------------|-------|--------|
| **Bandwidth** | 100 GB/mês | ~5 GB (MVP) | ✅ |
| **Build Minutes** | 6000 min/mês | ~100 min | ✅ |
| **Serverless Functions** | 100 GB-Hours | ~10 GB-Hours | ✅ |
| **Deployments** | Ilimitado | ∞ | ✅ |

**Upgrade para Pro ($20/mês) quando:**
- Bandwidth > 100 GB/mês
- Precisar de Analytics avançado
- Custom domains > 1
- Team collaboration

---

## 📚 Recursos

- [Vercel Docs](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Supabase + Vercel](https://supabase.com/docs/guides/platform/vercel)
- [Prisma + Vercel](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-vercel)

---

## ✅ Checklist Final

Após deploy bem-sucedido:

- [ ] Health check funcionando (`/api/health`)
- [ ] Login com Supabase Auth OK
- [ ] Dashboard carrega dados do Supabase
- [ ] PWA Service Worker ativo
- [ ] Vercel Analytics habilitado
- [ ] Custom domain configurado (opcional)
- [ ] Monitoring configurado
- [ ] Branch protection habilitada (opcional)
- [ ] Documentação atualizada

---

**🎉 Parabéns! Seu projeto está no ar!**
