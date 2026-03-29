# Guia: Adaptação de Mutation Hooks para Real-Time

## Visão Geral

Os mutation hooks precisam ser adaptados para funcionar com o sistema real-time:

- **Real-time conectado**: Pula invalidação manual (o broadcast cuida disso)
- **Real-time desconectado**: Invalida manualmente (fallback)

## Implementação Atual

O arquivo `src/lib/query/helpers.ts` já contém a função `shouldPerformInvalidation()` que:

```typescript
function shouldPerformInvalidation(isRealtimeActive?: boolean): boolean {
  // Se real-time não está inicializado, sempre invalida
  if (isRealtimeActive === undefined) return true;
  
  // Se real-time está conectado, PULA invalidação (RT cuida)
  if (isRealtimeActive) {
    console.log('[Cache] Skipping invalidation - real-time is active');
    return false;
  }
  
  // Real-time desconectado, invalida manualmente (fallback)
  return true;
}
```

## Como Adaptar Mutation Hooks

### Passo 1: Importar hooks real-time

```typescript
import { useRealtimeActive } from '@/hooks/use-realtime-status';
```

### Passo 2: Verificar conexão antes de invalidar

Exemplo de adaptação do `useCreateTask`:

```typescript
export function useCreateTask() {
  const queryClient = useQueryClient();
  const isRealtimeActive = useRealtimeActive();

  return useMutation({
    mutationFn: createTask,
    
    onSuccess: (task) => {
      // ONLY invalidate if real-time is disconnected
      if (!isRealtimeActive) {
        console.log('[useCreateTask] Real-time inactive, invalidating cache');
        smartInvalidateImmediate(
          queryClient, 
          queryKeys.tasks.lists(orgId)
        );
        invalidateDashboardQueries(queryClient, orgId);
      } else {
        console.log('[useCreateTask] Real-time active, skipping manual invalidation');
      }
    },
  });
}
```

### Passo 3: Mesmo padrão para todas as mutações

Aplique o mesmo padrão para:
- `useUpdateTask`
- `useDeleteTask`
- `useCreateFeature`
- `useUpdateFeature`
- `useDeleteFeature`
- `useCreateEpic`
- `useUpdateEpic`
- `useDeleteEpic`
- `useCreateComment`
- `useUpdateComment`
- `useDeleteComment`

## Padrão de Código

```typescript
export function use[Entity]Mutation() {
  const queryClient = useQueryClient();
  const isRealtimeActive = useRealtimeActive(); // ← ADICIONAR ISSO

  return useMutation({
    mutationFn: mutationFunction,
    
    onSuccess: (data) => {
      // ← ADICIONAR ESTE CHECK
      if (!isRealtimeActive) {
        // Lógica de invalidação existente
        smartInvalidateImmediate(queryClient, queryKey);
        // ... outras invalidações
      }
      // ← Se isRealtimeActive é true, nada acontece (broadcast cuida)
    },
  });
}
```

## Benefícios

1. **Sem código duplicado**: Invalidação inteligente já existe nos helpers
2. **Graceful degradation**: Funciona mesmo quando real-time falha
3. **Sem conflitos**: Evita invalidação dupla quando RT está ativo
4. **Fácil de testar**: Basta mudar `isRealtimeActive` no teste

## Próximos Passos

Para implementar completamente:

1. Adicionar `useRealtimeActive()` import em cada mutation hook
2. Envolver chamadas de invalidação em `if (!isRealtimeActive) { ... }`
3. Testar com real-time conectado e desconectado

---

**Arquivos a adaptar:**
- `src/lib/query/hooks/use-tasks.ts`
- `src/lib/query/hooks/use-features.ts`
- `src/lib/query/hooks/use-epics.ts`
- `src/lib/query/hooks/use-comments.ts`
- `src/lib/query/hooks/use-projects.ts`
- `src/lib/query/hooks/use-project-docs.ts`
- `src/lib/query/hooks/use-project-notes.ts`
