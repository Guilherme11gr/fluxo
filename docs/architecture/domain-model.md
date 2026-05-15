# Modelo De Dominio

## Hierarquia Principal

```text
Organization
└── Project
    └── Epic
        └── Feature
            └── Task
```

## Entidades Que Importam Mais

### Organization

- tenant principal do sistema
- quase tudo relevante e filtrado por organizacao

### Project

- pertence a uma organizacao
- possui `key` unico dentro da org
- possui `modules: string[]`

### Epic

- agrupa features de um objetivo maior

### Feature

- pertence a um epic
- agrega tasks e bugs

### Task

- pertence a `project`, `feature` e `organization`
- possui `localId` unico por projeto e `readableId` derivado de `project.key`
- `type`: `TASK` ou `BUG`
- `status`: `BACKLOG | TODO | DOING | REVIEW | QA_READY | DONE`
- `priority`: `LOW | MEDIUM | HIGH | CRITICAL`

## Regras De Dominio

- `Project.modules` e um array no proprio projeto, nao uma tabela separada.
- `ProjectDoc.content` fica em texto no banco; nao usar storage para essa memoria de projeto.
- bugs sao tasks com `type='BUG'`.
- task status inclui `QA_READY`; evite assumir workflow sem QA.
- IDs legiveis de task dependem de `project.key` + `localId`.

## Multi-Tenancy

- o contexto atual da org vem de `x-org-id`, depois cookie `jt-current-org`, depois membership default.
- a regra acima ja esta implementada em `extractAuthenticatedTenant()`; nao reimplemente.
