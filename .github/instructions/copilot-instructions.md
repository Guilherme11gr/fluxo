---
applyTo: '**'
---

# Codigo E Arquitetura

## Leia Primeiro

- `AGENTS.md`
- `docs/architecture/overview.md`
- `docs/guides/date-handling.md` quando mexer com datas

## Regras Do Repo

- use `extractAuthenticatedTenant()` em rotas protegidas por sessao
- use `extractAgentAuth()` em `src/app/api/agent/**`
- ao editar endpoint existente, preserve o padrao local; muitos endpoints importam repositorios direto de `@/infra/adapters/prisma`
- logica de negocio fica em `src/domain/use-cases/**`
- dinheiro em centavos no dominio; formatacao so na UI
- telefone exibido com `formatPhone()`
- datas usam apenas `@/shared/utils/date-utils`
- Tailwind apenas; dark mode e o padrao real
- para invalidacao de React Query, use os helpers de `@/lib/query/helpers`

## Testes

- nao bypass testes falhando sem entender a causa
- corrija o codigo quando o teste expuser bug real
- atualize teste apenas quando o comportamento esperado mudou de verdade

## Verificacao

- gate minimo: `npm run build && npm run test && npm run typecheck`
- rode `npm run lint` quando tocar codigo da app
