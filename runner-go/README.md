# FluXo Runner

FluXo Runner is a lightweight CLI agent worker that connects to a [FluXo](https://fluxo.agenda-aqui.com) instance, polls for pending tasks, and executes them autonomously using Claude Code or OpenCode.

Written in Go. Single static binary. Zero runtime dependencies.

## Install

Download the latest release for your platform:

```bash
# Linux
chmod +x fluxo-runner && sudo mv fluxo-runner /usr/local/bin/

# Windows
# Add fluxo-runner.exe to your PATH
```

Or build from source:

```bash
git clone https://github.com/fluxo-app/fluxo-runner.git
cd fluxo-runner
go build -o fluxo-runner .
```

## Quick Start

```bash
# 1. Create config
./fluxo-runner init

# 2. Set API key
export FLUXO_AGENT_API_KEY=your-key-here

# 3. Run
./fluxo-runner run
```

## Commands

| Command | Description |
|---------|-------------|
| `fluxo-runner run` | Start continuous polling (default) |
| `fluxo-runner run --once` | Single execution pass |
| `fluxo-runner init` | Interactive config setup |
| `fluxo-runner version` | Show version |

## Config

```yaml
runner:
  api_url: "https://fluxo.agenda-aqui.com/api/agent"
  api_key_env: "FLUXO_AGENT_API_KEY"
  poll_interval_sec: 30
  heartbeat_interval_sec: 60

agents:
  - name: "dev-agent"
    tool: "claude"
    workdir: "/path/to/project"
    pick_status: "TODO"
    claim_status: "DOING"
    done_status: "DONE"
    timeout: 300
```

## How It Works

```
┌─────────────┐     ┌───────────────┐     ┌──────────────┐
│  FluXo Web   │────▶│  FluXo API    │◀────│ fluxo-runner │
│  (Dashboard) │     │  (Control     │     │ (Worker CLI) │
│              │     │   Plane)      │     │              │
└─────────────┘     └───────────────┘     └──────┬───────┘
                                                  │
                                          ┌───────▼───────┐
                                          │ Claude Code   │
                                          │ or OpenCode   │
                                          └───────────────┘
```

1. **Poll** — Fetches pending tasks from FluXo API
2. **Claim** — Marks task as in-progress
3. **RAG** — Fetches relevant documentation context
4. **Execute** — Runs Claude Code or OpenCode with the task prompt
5. **Post** — Sends execution results back as a comment
6. **Handoff** — Updates task status and optionally reassigns

## Features

- **Multi-agent** — Run multiple agents with different tools in one config
- **RAG integration** — Automatically fetches relevant docs for context
- **Graceful shutdown** — Marks active tasks as BLOCKED on Ctrl+C
- **Heartbeat** — Reports agent status (ONLINE/BUSY/OFFLINE) to FluXo
- **Cross-platform** — Single binary for Linux, macOS, Windows

## Requirements

- Go 1.23+ (to build)
- Claude Code CLI or OpenCode CLI installed

## License

Proprietary — FluXo App
