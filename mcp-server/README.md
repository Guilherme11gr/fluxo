# JT-Kill MCP Server

[![npm version](https://img.shields.io/npm/v/@guilherme11gr/jt-kill-mcp.svg)](https://www.npmjs.com/package/@guilherme11gr/jt-kill-mcp)

MCP (Model Context Protocol) server para a JT-Kill Agent API. Permite que AI agents (Claude, etc) interajam diretamente com o sistema de gestão de projetos.

**✨ 27 ferramentas** para automação completa de tasks, features, epics, docs e tags.

---

## 🚀 Installation (NPM - Recomendado)

A forma mais simples de usar o MCP Server:

```json
// Claude Desktop config
{
  "mcpServers": {
    "jt-kill": {
      "command": "npx",
      "args": ["-y", "@guilherme11gr/jt-kill-mcp"],
      "env": {
        "AGENT_API_KEY": "agk_seu_token_aqui",
        "AGENT_NAME": "Claude Desktop"
      }
    }
  }
}
```

**Pronto!** O `npx` baixa e executa automaticamente. Sem build, sem dependências locais.

---

## 🛠️ Development (Local)

### 1. Clone e instale

```bash
git clone https://github.com/Guilherme11gr/fluxo.git
cd fluxo/mcp-server
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Configure localmente

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "jt-kill": {
      "command": "node",
      "args": ["D:/caminho/absoluto/jt-kill/mcp-server/dist/index.js"],
      "env": {
        "AGENT_API_KEY": "agk_5f8d2e1b9c3a4b7d8e9f0a1b2c3d4e5f",
        "AGENT_NAME": "Claude Desktop"
      }
    }
  }
}
```

---

## 🛠️ Tools Disponíveis (27 total)

### Tasks (9 tools)

| Tool | Descrição |
|------|-----------|
| `list_tasks` | Listar tasks com 13 filtros (status, feature, epic, blocked, search, etc) |
| `get_task` | Buscar task por UUID ou ID legível (ex: JKILL-123) |
| `create_task` | Criar nova task em uma feature |
| `update_task` | Atualizar task (status, description, priority, etc) |
| `delete_task` | ⚠️ Deletar task permanentemente |
| `bulk_update_tasks` | Atualizar múltiplas tasks de uma vez |
| `block_tasks` | Bloquear/desbloquear múltiplas tasks |
| `add_task_comment` | Adicionar comentário em uma task |
| `list_task_comments` | Listar comentários de uma task |

### Features (5 tools)

| Tool | Descrição |
|------|-----------|
| `list_features` | Listar features (filtrar por epic, status) |
| `get_feature` | Buscar feature com suas tasks |
| `create_feature` | Criar nova feature em um epic |
| `update_feature` | Atualizar feature |
| `delete_feature` | ⚠️ Deletar feature e suas tasks |

### Epics (3 tools)

| Tool | Descrição |
|------|-----------|
| `list_epics` | Listar epics (filtrar por project, status) |
| `get_epic` | Buscar epic básico |
| `get_epic_full` | ⭐ Buscar epic COMPLETO (features + tasks + stats) - 75% mais rápido |

### Projects (1 tool)

| Tool | Descrição |
|------|-----------|
| `list_projects` | Listar todos os projetos |

### Docs (5 tools)

| Tool | Descrição |
|------|-----------|
| `list_docs` | Listar documentos de um projeto |
| `get_doc` | Buscar conteúdo de um documento |
| `create_doc` | Criar documento markdown |
| `update_doc` | Atualizar documento |
| `delete_doc` | Deletar documento |

### Tags (4 tools)

| Tool | Descrição |
|------|-----------|
| `list_tags` | Listar tags de um projeto |
| `get_tag` | Buscar tag |
| `create_tag` | Criar nova tag |
| `delete_tag` | Deletar tag |

---

## 📋 Exemplos de Uso

### Ver minhas tasks em andamento

```
"Liste minhas tasks em DOING"
```
→ Usa `list_tasks` com `status=DOING`

### Pegar contexto completo de um epic

```
"Me dê o contexto completo do epic de autenticação"
```
→ Usa `get_epic_full` - retorna todas features, tasks e stats

### Criar uma task

```
"Crie uma task 'Implementar login com Google' na feature de autenticação"
```
→ Usa `create_task` com título e featureId

### Mover task para DONE

```
"Mova a task JKILL-123 para DONE com descrição do que foi implementado"
```
→ Usa `update_task` com status e description

### Bloquear tasks com problemas

```
"Bloqueie as tasks JKILL-124 e JKILL-125 - dependência externa pendente"
```
→ Usa `block_tasks` com ids e changeReason

---

## 🔧 Desenvolvimento

### Rodar em modo dev (sem build)

```bash
npm run dev
```

### Variáveis de ambiente

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `AGENT_API_KEY` | ✅ | API key (formato: agk_xxx) |
| `AGENT_API_URL` | ⚪ | URL da API (default: https://jt-kill.vercel.app/api/agent) |
| `AGENT_NAME` | ⚪ | Nome do agent nos logs e no header `X-Agent-Name` (default: Claude-MCP) |

---

## 📚 Resources

O servidor também expõe **resources** como contexto:

- `jtkill://api/schema` - Documentação self-describing da API

---

## 🐛 Troubleshooting

### "Missing required environment variables"

Verifique se `AGENT_API_KEY` está configurado no Claude Desktop config.

### "AUTH_ERROR"

A API key está inválida ou expirada. Verifique o valor em `AGENT_API_KEY`.

### Claude não encontra o servidor

1. Verifique se o build foi feito (`npm run build`)
2. Verifique o caminho absoluto no config
3. Reinicie o Claude Desktop completamente

### Logs de debug

O servidor escreve logs em stderr. Para ver:

```bash
AGENT_API_KEY=agk_xxx node dist/index.js 2>&1
```

---

## 📄 License

MIT
