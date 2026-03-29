# Plano: Suporte a Arrays e Multiplas Respostas no Runtime do Formula Adapter (nokode-forms-sdk)

## Contexto

O `nokode-formula-engine` v0.1.18 ja suporta arrays 100% (SUM, COUNT, COLUMN, LEN, IS_EMPTY, null-safe, EMPTY_COLLECTION). O gap agora esta no SDK: o value-normalizer passa arrays crus para o engine, sem normalizar items internos (currency, formula, composite). Alem disso, o error code `EMPTY_COLLECTION` ainda nao esta mapeado.

**Escopo:** Apenas runtime (formula.adapter + hooks + normalizer). O formula EDITOR (koiketec-ui, autocomplete, elegibilidade) fica pra fase 2.

**Repo:** `d:/Users/Guilherme/Documents/development/nokode-forms-sdk/`

---

## O que muda

### 1. Normalizar arrays recursivamente — `value-normalizer.ts`

**Arquivo:** `src/react-form-generator/utils/value-normalizer.ts`

Adicionar branch para arrays **ANTES** do check `isPlainObject` (entre linhas 76 e 80):

```typescript
// 3. Array: normalizar cada item recursivamente
if (Array.isArray(value)) {
  return value.map(item => normalize(item))
}
```

Isso resolve:
- `array<currency>` → `[{value:100,countryCode:"BRL"}, ...]` → `[100, ...]`
- `array<formula>` → `[{result:5,definition:...,dependencies:...}, ...]` → `[5, ...]`
- `array<composite>` → normaliza recursivamente subfields de cada item
- `array<number>` → passa direto
- `array<DataSourceItem>` (multiselect) → passa direto (strings nao mudam)

**Decisao importante:** Null items em arrays ficam como `null` (NAO viram 0). Diferente de composite subfields onde null → 0. No array, null deve ser preservado para COUNT ser preciso e o engine's `wrapAggregation` filtrar corretamente.

---

### 2. Mapear error `EMPTY_COLLECTION` — `use-formula-adapter.tsx`

**Arquivo:** `src/react-form-generator/hooks/use-formula-adapter.tsx`

Adicionar ao `errorKeyMap` (apos linha 116):
```typescript
EMPTY_COLLECTION: 'FORMULA_ERROR_EMPTY_COLLECTION',
```

---

### 3. Adicionar `EMPTY_COLLECTION` ao enum — `formula/types.ts`

**Arquivo:** `src/react-form-generator/components/component-adapters/formula/types.ts`

Adicionar ao `FormulaErrorType` enum (apos linha 13):
```typescript
EMPTY_COLLECTION = 'EMPTY_COLLECTION',
```

---

### 4. i18n para `EMPTY_COLLECTION`

**Arquivo:** `src/i18n/default-translations/pt-BR.json`
```json
"FORMULA_ERROR_EMPTY_COLLECTION": "Não é possível calcular sobre uma coleção vazia"
```

**Arquivo:** `src/i18n/default-translations/en-US.json`
```json
"FORMULA_ERROR_EMPTY_COLLECTION": "Cannot compute on an empty collection"
```

---

### 5. Testes unitarios do normalizer

**Arquivo novo:** `src/react-form-generator/utils/value-normalizer.test.ts`

Cenarios:
- Primitivos passam direto (number, string, null)
- Formula value → extrai .result
- Currency value → extrai .value
- **Array de numbers** → passa direto `[1,2,3]`
- **Array de currency** → `[{value:100,cc:"BRL"},{value:200,cc:"BRL"}]` → `[100, 200]`
- **Array de formula** → `[{result:5,...},{result:10,...}]` → `[5, 10]`
- **Array com null items** → `[1, null, 3]` → `[1, null, 3]` (null preservado)
- **Array de composites** → normaliza recursivamente cada composite
- **Array vazio** → `[]` → `[]`
- **MultipleSelection (DataSourceItem[])** → `[{key:"a",label:"A"}]` → mantem shape
- Composite com subcampos null → null vira 0 (comportamento existente)

---

## Ordem de implementacao

1. `value-normalizer.ts` — branch de array (mudanca critica, 4 linhas)
2. `value-normalizer.test.ts` — testes unitarios
3. `formula/types.ts` — enum EMPTY_COLLECTION
4. `use-formula-adapter.tsx` — errorKeyMap
5. `pt-BR.json` + `en-US.json` — i18n
6. Rodar testes

---

## Arquivos tocados

**Novo (1):**
- `src/react-form-generator/utils/value-normalizer.test.ts`

**Modificados (5):**
- `src/react-form-generator/utils/value-normalizer.ts`
- `src/react-form-generator/hooks/use-formula-adapter.tsx`
- `src/react-form-generator/components/component-adapters/formula/types.ts`
- `src/i18n/default-translations/pt-BR.json`
- `src/i18n/default-translations/en-US.json`

---

## O que NAO muda (e por que)

- **`formula-editor/types.ts` (FORMULA_ELIGIBLE_TYPES)** — gate do editor UI, nao do runtime. Fase 2.
- **`array.adapter.tsx` / `multiple-selection.adapter.tsx`** — ja persistem shapes corretos.
- **`use-formula-adapter.tsx` getValueById** — ja funciona corretamente; busca por root field e chama normalize(). Com o normalize tratando arrays, o fluxo funciona end-to-end.
- **`formula.adapter.tsx`** — componente de display, nao precisa mudar.

---

## Verificacao

```bash
npm test
```

Alem disso, validar manualmente que o normalizer trata arrays:
```typescript
import { normalize } from './value-normalizer'
normalize([{value: 100, countryCode: 'BRL'}, {value: 200, countryCode: 'BRL'}])
// Deve retornar: [100, 200]
```
