# Datas E Timezone

## Regra Obrigatoria

- backend e banco trabalham em UTC
- UI exibe em `America/Sao_Paulo`
- codigo da app deve usar apenas funcoes de `@/shared/utils/date-utils`

## Nao Faca

- importar `date-fns` direto em codigo de produto
- concatenar strings de data manualmente
- espalhar conversao de timezone por varios arquivos

## Faca

```ts
import {
  getCurrentDate,
  parseDate,
  parseDateFromInput,
  formatDateForDisplay,
  formatDateForDatabase,
  addDaysToDate,
  startOfDayUTC,
  endOfDayUTC,
} from '@/shared/utils/date-utils'
```

## Quando Faltar Uma Funcao

- adicione a funcao em `src/shared/utils/date-utils.ts`
- nao abra excecao para usar `date-fns` diretamente no chamador
- adicione teste da nova funcao
