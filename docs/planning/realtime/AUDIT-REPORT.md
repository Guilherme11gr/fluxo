# Real-time Implementation Audit Report

**Auditor realizada em:** 2026-01-13 01:40  
**Auditor:** Feature Auditor Specialist  
**Status:** 20 issues encontrados (7 críticos, 6 high-risk, 4 arquitetura, 3 performance)

---

## 1. Critical Issues (must fix)

### 1.1 Memory Leak: Multiple Supabase Clients Created
**Arquivo:** `src/lib/realtime/connection-manager.ts` (line 38-42)

**Problema:**
```typescript
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
```

Cria **NOVO cliente Supabase a cada chamada de `connect()`. Como `connect()` é chamado no reconnection, isso cria múltiplos clientes que nunca são limpos.

**Impacto:**
- Memory leak: cada cliente mantém WebSocket connections
- Conexões pendentes continuam ativas
- Performance degrada ao longo do tempo

**Solução:**
```typescript
// No constructor
private supabase: ReturnType<typeof createClient>;

constructor(config: ConnectionManagerConfig) {
  this.config = config;
  this.tabId = config.tabId || this.generateTabId();
  this.supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// No connect()
// this.channel = this.supabase.channel(...); // Usa cliente compartilhado
```

---

### 1.2 Memory Leak: Previous Channel Not Cleaned
**Arquivo:** `src/lib/realtime/connection-manager.ts` (line 58)

**Problema:**
```typescript
this.channel = supabase.channel(`org:${orgId}`, {...});
```

Quando `connect()` é chamado em reconnection, canal anterior **não é desconectado**. Fica "zombie" consumindo recursos.

**Impacto:**
- Múltiplos canais ativos para mesmo orgId
- Eventos duplicados sendo processados
- Memory leak

**Solução:**
```typescript
connect(orgId: string, userId: string) {
  // Limpar canal anterior se existir
  if (this.channel) {
    this.channel.unsubscribe();
  }
  
  // Criar novo canal
  this.channel = this.supabase.channel(...);
}
```

---

### 1.3 Infinite Re-render: Config Object Recreated Every Render
**Arquivo:** `src/hooks/use-realtime-connection.ts` (line 38-50)

**Problema:**
```typescript
const wrappedConfig = {
  onStatusChange: (newStatus: ConnectionStatus) => {
    setStatus(newStatus);
    config?.onStatusChange?.(newStatus);
  },
  onEvent: config?.onEvent || (() => {}),
  tabId: config?.tabId,
};
```

`wrappedConfig` é recriado a cada render. O useEffect depende de `wrappedConfig` (implicitamente via `managerRef.current`), causando re-renders infinitos.

**Impacto:**
- Component re-renderiza infinitamente
- CPU 100% em browser
- App congela

**Solução:**
```typescript
const wrappedConfig = useMemo(() => ({
  onStatusChange: (newStatus: ConnectionStatus) => {
    setStatus(newStatus);
    config?.onStatusChange?.(newStatus);
  },
  onEvent: config?.onEvent || (() => {}),
  tabId: config?.tabId,
}), [config, setStatus]); // Note: setStatus is stable
```

---

### 1.4 Infinite Re-render: Callbacks Recreated in useRealtimeSync
**Arquivo:** `src/hooks/use-realtime-sync.ts` (line 11-14, 18-23)

**Problema:**
```typescript
const { processEvent, isProcessing } = useRealtimeEventProcessor({
  onEventsProcessed: (events, keys) => {
    console.log(`[Realtime Sync] Processed ${events.length} events, ${keys.size} keys`);
  },
});

const { status, broadcast } = useRealtimeConnection({
  onEvent: (event) => {
    console.log('[Realtime Sync] Received event:', event);
    processEvent(event);
  },
});
```

Ambos callbacks são recriados a cada render, causando:
- Event processor recriado constantemente
- Connection manager recriado constantemente
- Re-renders em cascata

**Impacto:**
- Performance muito ruim
- Estado pode ser perdido
- Memory leak

**Solução:**
```typescript
const onEventsProcessed = useCallback((events, keys) => {
  console.log(`[Realtime Sync] Processed ${events.length} events, ${keys.size} keys`);
}, []);

const { processEvent, isProcessing } = useRealtimeEventProcessor({
  onEventsProcessed,
});

const onEvent = useCallback((event: BroadcastEvent) => {
  console.log('[Realtime Sync] Received event:', event);
  processEvent(event);
}, [processEvent]);

const { status, broadcast } = useRealtimeConnection({
  onEvent,
});
```

---

### 1.5 Race Condition: useEffect Dependencies
**Arquivo:** `src/hooks/use-realtime-connection.ts` (line 58-59)

**Problema:**
```typescript
useEffect(() => {
  if (!orgId || !user?.id) return;
  
  managerRef.current = new RealtimeConnectionManager(wrappedConfig);
  managerRef.current.connect(orgId, user.id);
  
  return () => {
    if (managerRef.current) {
      managerRef.current.disconnect();
    }
  };
}, [orgId, user?.id]);
```

Se usuário trocar de org rapidamente (ex: navigation rápida), o cleanup do useEffect anterior pode executar **DEPOIS** que o novo já conectou.

**Impacto:**
- Disconecta org errado
- Estado inconsistente
- Eventos perdidos

**Solução:**
```typescript
useEffect(() => {
  if (!orgId || !user?.id) return;
  
  // Guarda orgId atual para checar no cleanup
  const currentOrgId = orgId;
  
  managerRef.current = new RealtimeConnectionManager(wrappedConfig);
  managerRef.current.connect(orgId, user.id);
  
  return () => {
    // Só desconecta se ainda é o mesmo org
    if (managerRef.current && currentOrgId === orgId) {
      managerRef.current.disconnect();
    }
  };
}, [orgId, user?.id, wrappedConfig]);
```

---

### 1.6 Invalidation Keys Missing orgId
**Arquivo:** `src/lib/realtime/invalidation-map.ts` (line 18-44)

**Problema:**
```typescript
keys.push([getEntityKey(event.entityType), event.entityId]);
keys.push(['feature', event.featureId]);
keys.push(['task', event.entityId, 'comments']);
```

Query keys não incluem `orgId`. Mas a aplicação usa **multi-org**, e query keys incluem orgId para isolamento.

**Impacto:**
- Invalida queries de TODAS as orgs, não apenas da correta
- Dados de outras orgs são refetched desnecessariamente
- Viola isolamento multi-org

**Solução:**
```typescript
// Precisa receber orgId no evento
export function getInvalidationKeys(event: BroadcastEvent & { orgId: string }): QueryKey[] {
  const keys: QueryKey[] = [];

  keys.push([event.orgId, getEntityKey(event.entityType), event.entityId]);
  keys.push([event.orgId, 'feature', event.featureId]);
  // etc...
  
  return keys;
}

// Ou usar queryKeys do cache-config
import { queryKeys } from '../query/query-keys';

export function getInvalidationKeys(event: BroadcastEvent): QueryKey[] {
  return [
    queryKeys.tasks.detail(event.orgId, event.entityId),
    queryKeys.features.detail(event.orgId, event.featureId),
    // etc...
  ];
}
```

---

### 1.7 Dedup Bug: JSON.stringify Inconsistent Ordering
**Arquivo:** `src/lib/realtime/invalidation-map.ts` (line 84-90)

**Problema:**
```typescript
keySet.add(JSON.stringify(key));
```

JSON.stringify **não garante ordem consistente** de propriedades em objetos.

```javascript
JSON.stringify(['tasks', 'org-123', { status: 'TODO' }])
// vs
JSON.stringify(['tasks', 'org-123', { status: 'TODO' }])
// Podem ser strings diferentes mesmo sendo o mesmo key!
```

**Impacto:**
- Mesmo query key pode não ser deduplicada
- Refetch duplicado para mesma query
- Performance ruim

**Solução:**
```typescript
// Usar função de hash consistente
function hashQueryKey(key: QueryKey): string {
  // Arrays e objetos têm ordem garantida em JSON.stringify
  // Apenas precisa normalizar
  if (Array.isArray(key)) {
    return JSON.stringify(key.map(k => 
      typeof k === 'object' && k !== null 
        ? Object.keys(k).sort().reduce((acc, prop) => {
            acc[prop] = k[prop];
            return acc;
          }, {} as Record<string, unknown>)
        : k
    ));
  }
  return JSON.stringify(key);
}

keySet.add(hashQueryKey(key));
```

---

## 2. High-Risk / Edge Cases

### 2.1 Missing orgId in BroadcastEvent Type
**Arquivo:** `src/lib/realtime/types.ts` (line 12-26)

**Problema:** `BroadcastEvent` não inclui `orgId`.

**Impacto:**
- Não pode invalidar queries corretamente (veja issue 1.6)
- Não pode filtrar eventos por org
- Event sourcing incompleto

**Solução:**
```typescript
export interface BroadcastEvent {
  // ... campos existentes
  orgId: string; // ← ADICIONAR
  projectId: string;
  // ...
}
```

---

### 2.2 Missing Error Handling in connect()
**Arquivo:** `src/hooks/use-realtime-connection.ts` (line 72)

**Problema:** Não há try-catch ao redor do connect()

**Impacto:** Se connect() lançar erro (ex: network error), component crasha

**Solução:**
```typescript
try {
  managerRef.current.connect(orgId, user.id);
} catch (error) {
  console.error('[Realtime] Failed to connect:', error);
  setStatus('failed');
  config?.onStatusChange?.('failed');
}
```

---

### 2.3 Duplicate Export: useRealtimeActive
**Arquivos:** `src/hooks/use-realtime-sync.ts` e `src/hooks/use-realtime-status.ts`

**Problema:** `useRealtimeActive()` existe em **dois** arquivos.

**Impacto:** Confusão sobre qual hook usar, imports inconsistentes

**Solução:** Remover de `use-realtime-sync.ts`, manter apenas em `use-realtime-status.ts`

---

### 2.4 Env Vars Assertion Without Validation
**Arquivo:** `src/lib/realtime/connection-manager.ts` (line 38)

**Problema:**
```typescript
createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
```

Usa `!` sem validar se env vars existem.

**Impacto:** Runtime crash se env vars não configuradas

**Solução:**
```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be configured');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

---

### 2.5 Sequence Gap Detection Does Nothing
**Arquivo:** `src/lib/realtime/event-processor.ts` (line 102-107)

**Problema:** Detecta gaps mas só loga, não toma ação.

**Impacto:** Usuário não vê dados inconsistentes quando há gaps

**Solução:** Implementar catch-up query:
```typescript
if (gaps.length > 0) {
  console.warn(`[Realtime] Detected ${gaps.length} sequence gaps, fetching missing events`);
  // Trigger catch-up query
  queryClient.invalidateQueries({ 
    queryKey: ['audit_logs', event.orgId],
    refetchType: 'active'
  });
}
```

---

### 2.6 Processed Events Cleanup Removes Wrong Events
**Arquivo:** `src/lib/realtime/event-processor.ts` (line 115-120)

**Problema:**
```typescript
if (processedEventsRef.current.size > 1000) {
  const oldest = Array.from(processedEventsRef.current).slice(0, 500);
  for (const eventId of oldest) {
    processedEventsRef.current.delete(eventId);
  }
}
```

Remove **primeiros 500 eventos** do Set (que não tem ordem garantida), não necessariamente os mais antigos.

**Impacto:** Pode remover eventos recentes necessários para dedup

**Solução:**
```typescript
// Rastrear ordem dos eventos
interface ProcessedEvent {
  eventId: string;
  timestamp: number;
}

const processedEventsRef = useRef<Map<string, ProcessedEvent>>(new Map());

// Ao processar:
processedEventsRef.current.set(event.eventId, {
  eventId: event.eventId,
  timestamp: Date.now(),
});

// Cleanup:
if (processedEventsRef.current.size > 1000) {
  const entries = Array.from(processedEventsRef.current.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp);
  
  const toRemove = entries.slice(0, 500);
  for (const [eventId] of toRemove) {
    processedEventsRef.current.delete(eventId);
  }
}
```

---

## 3. Architecture / Code Smell Observations

### 3.1 Event Deduplication is O(n²)
**Arquivo:** `src/lib/realtime/event-processor.ts` (line 88-93)

**Problema:**
```typescript
const uniqueEvents = events.filter(
  (event, index, self) => 
    index === self.findIndex(e => e.eventId === event.eventId)
);
```

Para cada evento, busca em toda array. O(n²).

**Impacto:** Performance ruim com muitos eventos

**Solução:**
```typescript
const seen = new Set<string>();
const uniqueEvents: BroadcastEvent[] = [];

for (const event of events) {
  if (!seen.has(event.eventId)) {
    seen.add(event.eventId);
    uniqueEvents.push(event);
  }
}
```

---

### 3.2 Timer Not Stored for Cleanup
**Arquivo:** `src/lib/realtime/connection-manager.ts` (line 152)

**Problema:** `this.reconnectTimer` é armazenado, mas cleanup em `disconnect()` verifica se existe.

**Observação:** Código está correto, mas padrão é frágil. Se component unmount antes de timer disparar, pode executar após unmount se não for limpo.

**Solução:**
```typescript
disconnect() {
  if (this.reconnectTimer) {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }
  // ... resto do disconnect
}
```

---

### 3.3 Subscribe Status: Never Fires on Initial Failure
**Arquivo:** `src/lib/realtime/connection-manager.ts` (line 68-72)

**Problema:** Se subscribe falhar antes de atingir `SUBSCRIBED`, status fica em `connecting` para sempre.

**Impacto:** Usuário vê "Conectando..." indefinidamente

**Solução:**
```typescript
// Adicionar timeout
const connectTimeout = setTimeout(() => {
  if (this.currentStatus === 'connecting') {
    this.onDisconnected('Connection timeout');
  }
}, 10000); // 10 segundos

// No onConnected:
clearTimeout(connectTimeout);

// No disconnect:
if (connectTimeout) {
  clearTimeout(connectTimeout);
}
```

---

### 3.4 No Distinction Between Intentional and Error Disconnect
**Arquivo:** `src/lib/realtime/connection-manager.ts` (line 93)

**Problema:** Não distingue entre "disconnect intencional" (user logout, mudança de org) vs "disconnect por erro" (network falha).

**Impacto:** Pode tentar reconectar quando não deveria (ex: user deslogou)

**Solução:**
```typescript
private shouldReconnect = true;

connect() {
  this.shouldReconnect = true;
  // ...
}

disconnect() {
  this.shouldReconnect = false; // ← Flag para não reconectar
  // ...
}

private onDisconnected() {
  if (!this.shouldReconnect) return; // ← Checar flag
  this.scheduleReconnect();
}
```

---

## 4. Performance Considerations

### 4.1 Console Logs in Production
**Arquivos:** Múltiplos

**Problema:** `console.log` e `console.warn` em código production

**Impacto:** 
- Pode expor dados sensíveis em browser console
- Performance overhead
- Logs não são removidos em production builds

**Solução:**
```typescript
// Criar logger configurável
const logger = {
  log: process.env.NODE_ENV === 'development' ? console.log : () => {},
  warn: console.warn, // Sempre manter warnings
  error: console.error, // Sempre manter errors
};

logger.log('[Realtime] Processing batch...');
```

---

### 4.2 No Debounce on Broadcast
**Arquivo:** `src/lib/realtime/connection-manager.ts` (line 82)

**Problema:** `broadcast()` envia imediatamente sem debounce. Se múltiplas mutações rápidas, envia múltiplos broadcasts.

**Impacto:** Network overhead, eventos redundantes

**Solução:**
```typescript
// Debounce broadcasts
private broadcastTimer?: NodeJS.Timeout;
private broadcastQueue: Omit<BroadcastEvent, 'sequence'>[] = [];

broadcast(event: Omit<BroadcastEvent, 'sequence'>) {
  this.broadcastQueue.push(event);
  
  if (this.broadcastTimer) {
    clearTimeout(this.broadcastTimer);
  }
  
  this.broadcastTimer = setTimeout(() => {
    const events = this.broadcastQueue;
    this.broadcastQueue = [];
    
    // Batch broadcast if supported
    for (const event of events) {
      this.channel?.send({
        type: 'broadcast',
        event: 'entity_event',
        payload: event,
      });
    }
  }, 50); // 50ms batch
}
```

---

### 4.3 Event Queue Ref Recreation
**Arquivo:** `src/lib/realtime/event-processor.ts` (line 75)

**Problema:**
```typescript
const events = [...eventQueueRef.current];
```

Cria nova array a cada batch, causando alocação de memória

**Impacto:** Garbage collection mais frequente

**Observação:** Menor, mas pode ser otimizado se necessário

---

## 5. Suggested Improvements

### 5.1 Add Sequence Generation in Broadcast
**Arquivo:** `src/lib/realtime/connection-manager.ts`

**Problema:** `sequence` não é gerado automaticamente ao fazer broadcast.

**Solução:**
```typescript
private sequenceCounter = 0;

broadcast(event: Omit<BroadcastEvent, 'sequence'>) {
  const eventWithSequence = {
    ...event,
    sequence: this.sequenceCounter++, // ← Auto-increment
  };
  
  this.channel?.send({
    type: 'broadcast',
    event: 'entity_event',
    payload: eventWithSequence,
  });
}
```

---

### 5.2 Add Validation to BroadcastEvent
**Arquivo:** `src/lib/realtime/types.ts`

**Problema:** Não há validação de tipo

**Solução:**
```typescript
export function isValidBroadcastEvent(data: unknown): data is BroadcastEvent {
  if (!data || typeof data !== 'object') return false;
  
  const event = data as Partial<BroadcastEvent>;
  
  return (
    typeof event.eventId === 'string' && validateUUID(event.eventId) &&
    typeof event.sequence === 'number' &&
    typeof event.entityType === 'string' &&
    typeof event.entityId === 'string' &&
    typeof event.projectId === 'string' &&
    ['created', 'updated', 'deleted', 'status_changed', 'commented'].includes(event.eventType) &&
    ['user', 'agent', 'system'].includes(event.actorType) &&
    typeof event.actorName === 'string' &&
    typeof event.actorId === 'string' &&
    typeof event.timestamp === 'string'
  );
}

// No onEvent:
if (!isValidBroadcastEvent(payload)) {
  console.error('[Realtime] Invalid event received:', payload);
  return;
}
```

---

### 5.3 Add Connection Health Check
**Arquivo:** `src/lib/realtime/connection-manager.ts`

**Sugestão:** Implementar ping/pong para detectar conexões zumbis

```typescript
private healthCheckTimer?: NodeJS.Timeout;

private startHealthCheck() {
  this.healthCheckTimer = setInterval(() => {
    if (this.currentStatus !== 'connected') return;
    
    // Enviar ping ou verificar último evento recebido
    if (Date.now() - this.lastEventAt > 30000) { // 30s sem eventos
      console.warn('[Realtime] Connection appears dead, reconnecting');
      this.channel?.unsubscribe();
      this.onDisconnected('Connection dead');
    }
  }, 10000); // Check a cada 10s
}
```

---

### 5.4 Add Offline Detection with navigator.onLine
**Sugestão:** Integrar com API do browser para detectar offline

```typescript
useEffect(() => {
  const handleOnline = () => {
    if (status !== 'connected') {
      managerRef.current?.connect(orgId, user.id);
    }
  };
  
  const handleOffline = () => {
    console.log('[Realtime] Browser went offline');
  };
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}, [orgId, user.id, status]);
```

---

## Summary

### Issues by Severity

- **Critical:** 7 issues (memory leaks, infinite re-renders, multi-org isolation)
- **High-Risk:** 6 issues (edge cases, missing validations)
- **Architecture:** 4 issues (fragile patterns, missing safeguards)
- **Performance:** 3 issues (inefficient algorithms, unnecessary allocations)

### Recommended Fix Order

1. **IMEDIATO:**
   - Fix #1.1 (Supabase client creation)
   - Fix #1.3 (Infinite re-render in wrappedConfig)
   - Fix #1.4 (Infinite re-render in callbacks)
   - Fix #1.6 (Missing orgId in invalidation)

2. **ALTA PRIORIDADE:**
   - Fix #1.2 (Channel cleanup)
   - Fix #1.5 (Race condition)
   - Fix #1.7 (JSON.stringify inconsistency)
   - Fix #2.1 (Add orgId to BroadcastEvent)

3. **PRIORIDADE MÉDIA:**
   - Fix #2.3 (Duplicate export)
   - Fix #2.4 (Env var validation)
   - Fix #2.5 (Gap catch-up)
   - Fix #2.6 (Cleanup wrong events)
   - Fix #3.1 (O(n²) dedup)

4. **PRIORIDADE BAIXA:**
   - Fix restantes de arquitetura e performance
   - Implementar melhorias sugeridas

### Risk Assessment

**Antes dos fixes críticos:** Sistema NÃO deve ser usado em produção. Risco de:
- Memory leaks em minutos
- App congelando por infinite re-renders
- Dados inconsistentes entre orgs
- Eventos perdidos

**Após fixes críticos:** Sistema é estável e pronto para testes em produção.

---

**Total de issues encontradas:** 20  
**Tempo estimado para fixar críticos:** 4-6 horas  
**Complexidade:** Alta (múltiplos problemas interligados)
