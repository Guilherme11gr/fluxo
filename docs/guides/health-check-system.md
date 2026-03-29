# 🏥 Health Check System - Quick Reference

## 📖 Overview

Sistema automatizado que monitora a saúde de Features e o risco de Epics baseado no estado das Tasks.

---

## 🎯 Regras de Negócio

### Feature Health

| Status | Condição | Exemplo |
|--------|----------|---------|
| 🚨 **CRITICAL** | Possui task com `blocked = true` | "Has 2 blocked task(s)" |
| ⚠️ **WARNING** | Possui task em DOING há >3 dias | "Task stuck in Doing for 5.2 days" |
| ✅ **HEALTHY** | Nenhuma das anteriores | null |

### Epic Risk

| Status | Condição | Exemplo |
|--------|----------|---------|
| 🔴 **HIGH** | Possui feature com health CRITICAL | "Contains critical feature: Auth Module" |
| 🟡 **MEDIUM** | Possui feature com health WARNING | "Has 2 feature(s) with warnings" |
| 🟢 **LOW** | Todas features healthy | null |

---

## 🔄 Como Funciona (Automático)

### 1. Criar Task
```typescript
// A task é criada normalmente
const task = await taskRepository.create({
  title: "Nova task",
  featureId: "xxx",
  // ...
});

// ✅ Trigger automático:
// - status_changed_at = created_at
// - recalc_feature_health()
// - recalc_epic_risk()
```

### 2. Atualizar Task
```typescript
// Atualizar status ou blocked
const task = await taskRepository.update(id, orgId, {
  status: "DOING", // ou
  blocked: true
});

// ✅ Trigger automático:
// - Se status mudou → status_changed_at = now()
// - Se status ou blocked mudou → recalc feature + epic
```

### 3. Ler Health/Risk
```typescript
// Feature com health
const feature = await featureRepository.findById(id);
console.log(feature.health); // 'healthy' | 'warning' | 'critical'
console.log(feature.healthReason); // "Has 1 blocked task(s)"
console.log(feature.healthUpdatedAt); // 2026-01-07T01:36:10Z

// Epic com risk
const epic = await epicRepository.findById(id);
console.log(epic.risk); // 'low' | 'medium' | 'high'
console.log(epic.riskReason); // "Contains critical feature: Auth"
console.log(epic.riskUpdatedAt); // 2026-01-07T01:36:10Z
```

---

## 🛠️ API de Uso

### Bloquear Task (Manual)
```typescript
// UI: Usuário clica em "Block Task"
await taskRepository.update(taskId, orgId, {
  blocked: true
});

// ✅ Feature automaticamente vira CRITICAL
// ✅ Epic automaticamente vira HIGH RISK
```

### Desbloquear Task
```typescript
await taskRepository.update(taskId, orgId, {
  blocked: false
});

// ✅ Recalcula health automaticamente
```

### Mover Task para DOING
```typescript
await taskRepository.updateStatus(taskId, orgId, 'DOING');

// ✅ status_changed_at é atualizado automaticamente
// ✅ Após 3 dias, feature vai para WARNING
```

---

## 🧪 Testes

### Testar Blocked Task
```typescript
describe('Health Check - Blocked Task', () => {
  it('should mark feature as CRITICAL when task is blocked', async () => {
    // 1. Criar task
    const task = await taskRepository.create({ featureId: 'xxx', ... });
    
    // 2. Bloquear
    await taskRepository.update(task.id, orgId, { blocked: true });
    
    // 3. Verificar feature
    const feature = await featureRepository.findById('xxx');
    expect(feature.health).toBe('critical');
    expect(feature.healthReason).toContain('blocked');
  });
});
```

### Testar Task Stuck in DOING
```typescript
describe('Health Check - Stuck Task', () => {
  it('should mark feature as WARNING when task stuck >3 days', async () => {
    // 1. Criar task em DOING há 4 dias
    const task = await taskRepository.create({ 
      status: 'DOING',
      statusChangedAt: new Date('2026-01-01') // 4 dias atrás
    });
    
    // 2. Forçar recalc (trigger não disparou pois é mock)
    await prisma.$executeRaw`SELECT recalc_feature_health(${featureId})`;
    
    // 3. Verificar
    const feature = await featureRepository.findById(featureId);
    expect(feature.health).toBe('warning');
    expect(feature.healthReason).toContain('stuck');
  });
});
```

---

## 🎨 UI Components (Futuro - JKILL-33)

### Feature Health Badge
```tsx
<FeatureHealthBadge 
  health={feature.health}
  reason={feature.healthReason}
  updatedAt={feature.healthUpdatedAt}
/>

// Renderiza:
// ✅ Healthy
// ⚠️ Warning (tooltip: "Task stuck in Doing for 5 days")
// 🚨 Critical (tooltip: "Has 2 blocked tasks")
```

### Epic Risk Badge
```tsx
<EpicRiskBadge 
  risk={epic.risk}
  reason={epic.riskReason}
/>

// Renderiza:
// 🟢 Low Risk
// 🟡 Medium Risk (tooltip: "Has 1 feature with warnings")
// 🔴 High Risk (tooltip: "Contains critical feature: Auth")
```

### Task Block Toggle
```tsx
<TaskCard task={task}>
  <BlockToggle 
    blocked={task.blocked}
    onChange={(blocked) => updateTask({ blocked })}
  />
</TaskCard>

// Renderiza:
// [ ] Blocked (checkbox)
// Quando marcado → feature vira CRITICAL
```

---

## 🔧 Recalc Manual (Raro)

Normalmente não é necessário, mas se precisar forçar recálculo:

```sql
-- Via SQL
SELECT recalc_feature_health('feature-uuid-here');
SELECT recalc_epic_risk('epic-uuid-here');
```

```typescript
// Via Prisma (se precisar)
await prisma.$executeRawUnsafe(`
  SELECT recalc_feature_health($1)
`, featureId);
```

---

## 📊 Queries Úteis

### Ver features com problemas
```sql
SELECT 
  f.title,
  f.health,
  f.health_reason,
  COUNT(t.id) FILTER (WHERE t.blocked = true) as blocked_tasks
FROM features f
LEFT JOIN tasks t ON t.feature_id = f.id
WHERE f.health != 'healthy'
GROUP BY f.id, f.title, f.health, f.health_reason;
```

### Ver epics em risco
```sql
SELECT 
  e.title,
  e.risk,
  e.risk_reason,
  COUNT(f.id) FILTER (WHERE f.health = 'critical') as critical_features,
  COUNT(f.id) FILTER (WHERE f.health = 'warning') as warning_features
FROM epics e
LEFT JOIN features f ON f.epic_id = e.id
WHERE e.risk != 'low'
GROUP BY e.id, e.title, e.risk, e.risk_reason;
```

### Ver tasks bloqueadas
```sql
SELECT 
  t.id,
  t.title,
  t.blocked,
  f.title as feature,
  e.title as epic
FROM tasks t
JOIN features f ON f.id = t.feature_id
JOIN epics e ON e.id = f.epic_id
WHERE t.blocked = true;
```

---

## ⚠️ Troubleshooting

### Problema: Health não atualiza na UI
**Causa**: Cache do React Query  
**Solução**:
```typescript
// Invalidar cache após update
queryClient.invalidateQueries({ 
  queryKey: queryKeys.features.lists() 
});
```

### Problema: Health_reason está null mas health é warning
**Causa**: Bug na migration  
**Solução**:
```sql
-- Reprocessar todas as features
SELECT f.id, recalc_feature_health(f.id) 
FROM features f;
```

### Problema: Trigger não dispara em bulk update SQL
**Causa**: Triggers `FOR EACH ROW` podem ter delay em updates massivos  
**Solução**: Chamar recalc manualmente após bulk update

---

## 🚀 Performance

### Índices Criados
- `idx_tasks_feature_blocked` - WHERE blocked = true
- `idx_tasks_feature_doing_status` - WHERE status = 'DOING'
- `idx_features_epic_health` - WHERE health IN ('warning', 'critical')

### Custo de Update Task
- Update sem mudança de status/blocked: **0 queries extras**
- Update com mudança de status: **+2 queries** (recalc feature + epic)
- Tempo médio: **~120ms** (inclui recalc)

---

## 📝 Changelog

### v1.0.0 - 2026-01-07
- ✅ Sistema base implementado
- ✅ Triggers automáticos
- ✅ Backfill de dados existentes
- ⏳ UI pending (JKILL-33, JKILL-34)

---

**Ver também**:
- [Validation Report](./MIGRATION-HEALTH-CHECK-VALIDATION.md)
- [Architecture Overview](../architecture/overview.md)
