# Cache E Invalidation

## Regra Principal

Para invalidacao de React Query, use os helpers de `@/lib/query/helpers` em vez de chamar `invalidateQueries()` de forma solta.

## Helpers Importantes

- `smartInvalidate(queryClient, key)`
- `smartInvalidateImmediate(queryClient, key)`
- `smartInvalidateMany(queryClient, keys)`
- `invalidateDashboardQueries(queryClient, orgId)`
- `invalidateTaskQueries(queryClient, orgId, featureId?)`

## Regras

- passe `orgId` nos helpers que invalidam dados multi-tenant
- para invalidacao manual, use `refetchType: 'active'`
- GETs de dados mutaveis devem responder com `cache: 'none'`
- mantenha dashboard e listas em sincronia apos mutations de task

## Quando Usar `smartInvalidateImmediate`

- create
- delete
- move ou troca de status com impacto visual imediato

## Quando `smartInvalidate` Basta

- updates simples sem reordenacao estrutural

## Repositorio Atual

- `src/lib/query/helpers.ts` e a fonte principal de padrao
- `src/app/api/tasks/route.ts` mostra o padrao de endpoint mutavel sem cache HTTP
