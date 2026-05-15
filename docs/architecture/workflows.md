# Workflows Principais

## Task Status

```text
BACKLOG -> TODO -> DOING -> REVIEW -> QA_READY -> DONE
```

## Transicoes Mais Importantes

- `TODO -> DOING`
- `DOING -> REVIEW`
- `REVIEW -> QA_READY`
- `QA_READY -> DONE`
- `QA_READY -> DOING` para ping-pong de QA

## Regras Operacionais

- `QA_READY` existe de verdade no schema e nas rotas; nao remova esse estado por simplificacao.
- ping-pong de QA volta a task para `DOING` sem necessariamente trocar assignee.
- bugs sao tasks comuns com `type='BUG'`; trate o fluxo sem criar um modelo paralelo.

## Agent Workflow

- rotas de agente ficam em `src/app/api/agent/**`
- essas rotas usam `extractAgentAuth()` e nao sessao web
- runner e runner-go dependem da Agent API para claim, heartbeat e finalize
