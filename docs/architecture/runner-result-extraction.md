# Runner Result Extraction

Quando o agente principal (opencode, claude) termina a execucao com sucesso
mas nao retorna o bloco `FLUXO_RESULT_JSON_START/END` valido, um modelo auxiliar
barato reconstroi o `ExecutionResultV1` a partir do log raw da execucao.

## Motivação

- Agentes podem executar a task corretamente mas falhar em produzir o bloco de
  output contract (modelo truncou, esqueceu os marcadores, etc.)
- Marcar a execucao como `FAILED` nesse caso e injusto e gera retrabalho
- Um modelo auxiliar leve (Gemini Flash, Haiku, etc.) consegue extrair o
  resultado estruturado do log a um custo negligenciavel

## Arquitetura

O extractor e um adapter desacoplado do provider principal:

```
runner-go/internal/extractor/
  extractor.go   — interface StructuredResultExtractor + factory
  types.go       — ExtractRequest, ExtractResult
  noop.go        — fallback que sempre retorna erro
  gemini.go      — adapter para Gemini API (Gemini Flash)
```

A interface permite trocar de provider (Gemini, OpenAI, Ollama local, etc.)
sem alterar o fluxo do worker.

### Fluxo

```text
agente executa (opencode run --format json)
        |
        v
BuildExecutionResultV1WithContextAndMeta()
        |
        ├─ source = model/repaired → segue normal
        |
        └─ source = derived E result.Success = true
                |
                ├─ extractor desabilitado → mantem derived
                |
                └─ chama extractor.Extract(rawOutput, readableOutput, ...)
                        |
                        ├─ retorno valido → source = extracted
                        └─ retorno invalido → mantem derived, loga erro
```

### Sources de Output Contract

| Source     | Significado |
|------------|-------------|
| `model`    | Agente produziu JSON valido com os marcadores |
| `repaired` | JSON veio malformado, runner conseguiu reparar |
| `extracted` | Nao havia bloco; modelo auxiliar extraiu do log |
| `derived`  | Nenhum bloco nem extracao possivel; resultado sintetico |

## Configuração

### Global (RunnerConfig)

```yaml
runner:
  result_extractor:
    enabled: true
    provider: gemini
    model: gemini-3.1-flash-lite
    api_key_env: GEMINI_API_KEY
    timeout_sec: 20
    max_input_chars: 30000
```

### Por Agent (override opcional)

```yaml
agents:
  - name: builder
    tool: opencode
    model: glm-5.1
    result_extractor:
      enabled: true
      provider: gemini
      model: gemini-3.1-flash-lite
```

No YAML local e no modo dinamico (payload `config.result_extractor` vindo da
API), a semantica de heranca e:

- agent unset: herda o global
- agent `enabled: false`: desliga explicitamente
- agent `enabled: true`: liga explicitamente

Formato esperado no `config` da API:

```json
{
  "result_extractor": {
    "enabled": true,
    "provider": "gemini",
    "model": "gemini-3.1-flash-lite",
    "api_key_env": "GEMINI_API_KEY",
    "timeout_sec": 20,
    "max_input_chars": 30000
  }
}
```

Se o agent nao definir `result_extractor`, usa o global. Se nenhum dos dois
definir, extractor fica desabilitado (noop).

## Prompt do Extrator

O extractor recebe:
- `readableOutput`: saida formatada pelo runner (eventos JSONL convertidos)
- `filesTouched`: arquivos detectados via git diff
- Contexto minimo da task (title, description)

A resposta esperada e um JSON puro (sem marcadores `FLUXO_RESULT_JSON_*`) que
passe pelo mesmo parser do `ExecutionResultV1` usado pelo runner.

O prompt instrui o modelo a:
- Preencher `filesTouched` com os arquivos fornecidos se o log nao mencionar outros
- Preencher `checksRun` apenas com checks que aparecem explicitamente no log
- Usar `whatChanged`, `decisions`, `risks` baseado no que o agente disse/faz
- Preencher `git.mode` como `manual`
- Deixar `memoryCandidates` e `skillCandidates` vazios
- Preencher `status` como `success` ou `failed` baseado no log
- Retornar APENAS o JSON, sem texto adicional

## Normalizacao do Worker

Depois do parse do payload extraido, o worker ainda trata o resultado como um
enriquecimento seguro do `derived`, nao como substituicao cega:

- em execucao bem-sucedida, `status` e forçado para `success`
- `schemaVersion` e forcado para `v1`
- se `filesTouched` ja foi detectado pelo runner, essa lista vence
- se `git.mode` vier vazio, cai para `manual` antes do merge com o snapshot real
- se `summary` vier vazio, o worker reaproveita o summary derivado anterior

Isso evita que o extractor contradiga fatos objetivos do sistema.

## Observabilidade

Metadados adicionados ao `outputContract` e ao bloco `extractor` no metadata
da execucao:

```json
{
  "outputContract": {
    "source": "extracted",
    "hadMarkers": false,
    "repairApplied": false
  },
  "extractor": {
    "attempted": true,
    "provider": "gemini",
    "model": "gemini-3.1-flash-lite",
    "success": true,
    "error": null,
    "latencyMs": 450,
    "inputChars": 15234
  }
}
```

## Relação com a Skill

A skill `fluxo-runner-output-v1` continua sendo a camada primaria de prevencao.
O extractor e fallback — nao substitui o contrato, apenas recupera quando o
agente falha em cumpri-lo.

Quando o extractor e usado (`source = extracted`), isso e um sinal de que a
skill pode precisar de reforco. No futuro, um background review (estilo Hermes)
pode usar esse sinal para melhorar a skill automaticamente.
