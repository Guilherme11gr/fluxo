# 🤖 Guia do MCP Server para AI Agents

⚠️ **OBRIGATÓRIO**: Leia e compreenda este documento ANTES de executar qualquer feature.  
O MCP do JT-Kill é a interface nativa de gerenciamento de tasks e DEVE ser usado para:
- ✅ Pegar tasks do backlog (list_tasks, get_task)
- ✅ Atualizar status e descrições (update_task)
- ✅ Documentar implementações com quality gates
- ✅ Operações em massa (bulk_update_tasks, block_tasks)

**Não use API HTTP diretamente** - O MCP abstrai toda comunicação e garante consistência.

---

Este guia ensina como usar o MCP Server do JT-Kill para gerenciar projetos de forma nativa.

🚀 Quick Start
O MCP expõe 27 tools que permitem interagir com o JT-Kill sem fazer chamadas HTTP manuais.

Tools Disponíveis
Categoria	Tools	Descrição
Projects	list_projects	Listar todos os projetos
Epics	list_epics, get_epic, get_epic_full	Gerenciar epics
Features	list_features, get_feature, create_feature, update_feature, delete_feature	CRUD de features
Tasks	list_tasks, get_task, create_task, update_task, delete_task	CRUD de tasks
Bulk	bulk_update_tasks, block_tasks	Operações em massa
Comments	add_task_comment, list_task_comments	Comentários em tasks
Docs	list_docs, get_doc, create_doc, update_doc, delete_doc	Documentação
Tags	list_tags, get_tag, create_tag, delete_tag	Tags de projeto
📋 Fluxo de Trabalho com Tasks
1. Descobrir Contexto
Sempre comece entendendo o contexto do projeto:

text
# Listar projetos disponíveis
→ list_projects

# Ver epics de um projeto  
→ list_epics (projectId: "uuid")

# Obter contexto COMPLETO de um epic (⭐ RECOMENDADO)
→ get_epic_full (id: "uuid")
   ↳ Retorna epic + features + tasks + stats em UMA chamada
2. Pegar uma Task
text
# Buscar task específica (aceita UUID ou readable ID)
→ get_task (id: "JKILL-123")

# Ou listar tasks filtradas
→ list_tasks (status: "TODO", projectId: "uuid")
3. Iniciar Trabalho
text
→ update_task
   id: "uuid"
   status: "DOING"
   assigneeId: "b7d65a91-7cb6-4583-b46d-4f64713ffae2"
   changeReason: "Iniciando implementação"
4. Executar e Documentar
Faça o trabalho e atualize a descrição com detalhes:

text
→ update_task
   id: "uuid"
   description: "[descrição original]\n\n---\n## Implementação\n\n**Arquivos:**\n- src/feature.ts\n\n**Quality Gates:** ✅ PASS"
   changeReason: "Documentando implementação realizada"
5. 🔴 QUALITY GATE OBRIGATÓRIO
NUNCA mova para REVIEW/DONE sem executar:

bash
npm run build && npm test && npm run typecheck
6. Finalizar
text
→ update_task
   id: "uuid"
   status: "DONE"
   changeReason: "Quality gate passou, implementação completa"
🎯 Operações em Massa (Bulk)
Atualizar Múltiplas Tasks
text
→ bulk_update_tasks
   ids: ["uuid1", "uuid2", "uuid3"]
   status: "TODO"
   priority: "HIGH"
   changeReason: "Priorizando tasks do sprint"
Bloquear/Desbloquear em Massa
text
→ block_tasks
   ids: ["uuid1", "uuid2"]
   blocked: true
   changeReason: "Dependência externa não disponível"
📝 Formato de Descrição (OBRIGATÓRIO)
Ao finalizar uma task, SEMPRE enriqueça a descrição:

markdown
[Descrição original da task]

---
## Implementação Realizada

**Arquivos criados:**
- `path/to/file.ts` - Descrição breve
- `path/to/file.test.ts` (X testes)

**Arquivos modificados:**
- `path/to/existing.ts` - O que foi alterado

## Cobertura de Testes

- Casos de sucesso (cenário A, B, C)
- Erros (validação, not found, conflito)
- Edge cases (lista vazia, valores limite)

## Problemas Encontrados e Corrigidos

- **Problema**: Descrição
  - **Causa**: Por que aconteceu
  - **Solução**: Como foi resolvido

## Quality Gates

- TypeScript: ✅ PASS
- ESLint: ✅ PASS  
- Jest: ✅ PASS (X testes)
📋 Code Review de Tasks em REVIEW
Fluxo de Review
text
# 1. Listar tasks em REVIEW
→ list_tasks (status: "REVIEW")

# 2. Analisar cada uma e decidir
Decisões de Review
Situação	Ação
Issues críticos	block_tasks + comentário detalhado
Feature com UI	Manter REVIEW + comentário "Ready for QA visual"
Código sem UI	Mover para DONE + comentário de aprovação
Exemplo de Aprovação
text
→ add_task_comment
   id: "uuid"
   content: "## ✅ Aprovado\n\n**Quality Gate:** PASS\n**Validação:**\n- [x] Código auditado\n- [x] Testes OK\n- [x] Sem breaking changes"

→ update_task
   id: "uuid"
   status: "DONE"
   changeReason: "Code review aprovado, quality gate OK"
Exemplo de Bloqueio
text
→ add_task_comment
   id: "uuid"
   content: "## ❌ BLOQUEADO\n\n**Issues Críticos:**\n1. Redirect loop em cenário X\n2. Memory leak no cache\n\n**Próximos passos:** Corrigir e re-submeter"

→ update_task
   id: "uuid"
   blocked: true
   changeReason: "Issues críticos encontrados no code review"
📚 Gerenciamento de Documentação
Criar Doc de Projeto
text
→ create_doc
   projectId: "uuid"
   title: "Arquitetura do Sistema"
   content: "# Arquitetura\n\n## Visão Geral\n..."
Atualizar Doc
text
→ update_doc
   id: "uuid"
   content: "[conteúdo atualizado em markdown]"
🏷️ Gerenciamento de Tags
text
# Criar tag
→ create_tag (projectId: "uuid", name: "urgent")

# Listar tags do projeto
→ list_tags (projectId: "uuid")

# Deletar tag
→ delete_tag (id: "uuid")
⚡ Dicas de Performance
1. Use get_epic_full para Contexto
Uma chamada retorna tudo:

Epic completo
Todas as features
Todas as tasks
Stats agregadas
75% mais rápido que fazer chamadas separadas.

2. Use Bulk Operations
text
# ❌ Lento: atualizar uma por uma
→ update_task (id: "1", status: "TODO")
→ update_task (id: "2", status: "TODO")
→ update_task (id: "3", status: "TODO")

# ✅ Rápido: bulk update
→ bulk_update_tasks (ids: ["1","2","3"], status: "TODO")
3. Filtre nas Queries
text
# ❌ Ruim: buscar todas e filtrar no client
→ list_tasks (limit: 100)

# ✅ Bom: filtrar no servidor
→ list_tasks (status: "DOING", projectId: "uuid", limit: 20)
🔍 Filtros Disponíveis
list_tasks
Filtro	Tipo	Descrição
projectId	uuid	Tasks de um projeto
epicId	uuid	Tasks de um epic
featureId	uuid	Tasks de uma feature
status	enum	BACKLOG, TODO, DOING, REVIEW, DONE
type	enum	TASK, BUG
priority	enum	LOW, MEDIUM, HIGH, CRITICAL
blocked	boolean	Apenas bloqueadas
assigneeId	uuid	Tasks de um usuário
search	string	Busca em título/descrição
limit	number	Max resultados (default: 50)
list_features
Filtro	Tipo	Descrição
epicId	uuid	Features de um epic
status	enum	BACKLOG, TODO, DOING, DONE
limit	number	Max resultados
list_epics
Filtro	Tipo	Descrição
projectId	uuid	Epics de um projeto
status	enum	OPEN, IN_PROGRESS, DONE
limit	number	Max resultados
🚨 Regras Críticas
1. Quality Gate é OBRIGATÓRIO
bash
npm run build && npm test && npm run typecheck
Todos devem passar antes de REVIEW/DONE.

2. Sempre Documente
Toda task finalizada deve ter descrição enriquecida com:

O que foi feito
Arquivos criados/modificados
Problemas encontrados
Status do quality gate
3. Use changeReason
Toda mutação deve incluir motivo:

text
→ update_task
   changeReason: "Motivo claro da mudança"
4. Assignee em DOING
Ao mover para DOING, sempre atribua:

text
→ update_task
   status: "DOING"
   assigneeId: "b7d65a91-7cb6-4583-b46d-4f64713ffae2"
📊 IDs e Referências
Readable IDs
Tasks podem ser referenciadas por:

UUID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
Readable ID: JKILL-123
text
→ get_task (id: "JKILL-123")  # ✅ Funciona
→ get_task (id: "uuid...")     # ✅ Funciona
IDs Importantes
ID	Descrição
b7d65a91-7cb6-4583-b46d-4f64713ffae2	Gepeto/Copilot (assignee)
9f6d9015-b19a-441c-a8d1-52d507d50eda	Projeto JKILL
🆘 Troubleshooting
"Task not found"
Verifique se o ID está correto
Use readable ID (JKILL-123) se não tiver UUID
"Validation error"
Verifique campos obrigatórios
featureId é obrigatório para criar task
projectId é obrigatório para criar doc/tag
"Network error"
Servidor local deve estar rodando (npm run dev)
Verifique URL em AGENT_API_URL
📖 Exemplos de Prompts Naturais
text
"Liste as tasks em DOING do projeto JKILL"
→ list_tasks (projectId: "...", status: "DOING")

"Me dê o contexto completo do epic Real-time"
→ get_epic_full (id: "...")

"Crie uma task de bug na feature X"
→ create_task (featureId: "...", type: "BUG", ...)

"Mova JKILL-123 para DONE"
→ update_task (id: "JKILL-123", status: "DONE")

"Bloqueie as tasks 1, 2 e 3"
→ block_tasks (ids: [...], blocked: true)

"Adicione um comentário na task"
→ add_task_comment (id: "...", content: "...")
Última atualização: Janeiro 2026