# FluXo Runner

MVP v0.2.0 — Agent que polla tarefas do FluXo e executa com Claude Code ou OpenCode.

## Uso

```bash
# Configurar
cp config.yaml.example config.yaml
# Editar config.yaml com agentId, tool, projectId

# Executar (loop contínuo)
node runner.js

# Executar uma vez (debug)
node runner.js --once
```

## Configuração (config.yaml)

| Campo       | Descrição                                  |
|-------------|---------------------------------------------|
| `agentId`   | ID do agent registrado no FluXo             |
| `tool`      | `claude` (Claude Code) ou `opencode`        |
| `projectId` | ID do projeto no FluXo                      |
| `apiUrl`    | URL base da API (default: FluXo production) |

## Estrutura

```
runner/
├── runner.js          # Script principal (532 linhas)
├── config.yaml        # Configuração do agent
├── migrations/
│   └── 001_agents.sql # Schema da tabela agents
└── README.md
```

## Fluxo

1. **Poll** — Busca tarefa pendente atribuída ao agent
2. **Claim** — Marca tarefa como `in_progress`
3. **Execute** — Roda Claude Code / OpenCode no contexto do projeto
4. **Post Result** — Envia output de volta ao FluXo
5. **Heartbeat** — Sinaliza que está vivo durante execução longa

## Dependências

- Node.js 18+
- Claude Code CLI ou OpenCode CLI instalado
