#!/usr/bin/env node
// FluXo Runner MVP — bridge between FluXo web and local CLI agents
// Usage: node runner.js [--config path/to/config.yaml] [--once]

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const url = require("url");

const VERSION = "0.2.0";
let activeTask = null; // for graceful shutdown

// ---------------------------------------------------------------------------
// Config (minimal YAML parser)
// ---------------------------------------------------------------------------

function loadConfig(configPath) {
  const raw = fs.readFileSync(configPath, "utf-8");
  return parseYamlSimple(raw);
}

function parseYamlSimple(text) {
  const result = {};
  let currentSection = null;
  let currentAgent = null;
  let inContext = false;
  let contextLines = [];

  for (const line of text.split("\n")) {
    if (inContext) {
      if (line.match(/^\s{6}\S/) && !line.match(/^\s{6}["'|]/) && !line.startsWith("      ")) {
        if (contextLines.length > 0) {
          currentAgent.context = contextLines.join("\n").trim();
        }
        inContext = false;
        contextLines = [];
      } else {
        const ctxLine = line.replace(/^\s{6}/, "");
        if (ctxLine.trim()) contextLines.push(ctxLine);
        continue;
      }
    }

    if (line.match(/^\s*#/) || line.trim() === "") continue;

    if (line.startsWith("runner:")) {
      currentSection = "runner";
      result.runner = {};
      currentAgent = null;
    } else if (line.startsWith("agents:")) {
      currentSection = "agents";
      result.agents = [];
      currentAgent = null;
    } else if (currentSection === "runner" && line.match(/^  [\w_]+:/)) {
      const [key, ...rest] = line.trim().split(":");
      const val = rest.join(":").trim().replace(/^["']|["']$/g, "");
      if (val) result.runner[key] = val;
    } else if (currentSection === "agents" && line.match(/^  - name:/)) {
      currentAgent = { name: line.split(":")[1].trim().replace(/^["']|["']$/g, "") };
      result.agents.push(currentAgent);
    } else if (currentAgent && line.match(/^    [\w_]+:/)) {
      const [key, ...rest] = line.trim().split(":");
      const val = rest.join(":").trim().replace(/^["']|["']$/g, "");
      if (key === "context") {
        inContext = true;
        contextLines = [];
      } else if (val && val !== "null") {
        currentAgent[key] = val;
      }
    }
  }

  if (inContext && contextLines.length > 0) {
    currentAgent.context = contextLines.join("\n").trim();
  }

  return result;
}

// ---------------------------------------------------------------------------
// HTTP helpers (native https, zero deps)
// ---------------------------------------------------------------------------

function httpRequest(method, href, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(href);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method,
      headers: { ...headers },
      timeout: 30000,
    };

    if (body) {
      const data = JSON.stringify(body);
      options.headers["Content-Type"] = "application/json";
      options.headers["Content-Length"] = Buffer.byteLength(data);
    }

    const req = https.request(options, (res) => {
      let responseBody = "";
      res.on("data", (d) => (responseBody += d));
      res.on("end", () => {
        try {
          resolve(JSON.parse(responseBody));
        } catch {
          resolve({ status: res.statusCode, raw: responseBody });
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timeout")); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const httpGet = (href, headers) => httpRequest("GET", href, headers);
const httpPost = (href, headers, body) => httpRequest("POST", href, headers, body);
const httpPatch = (href, headers, body) => httpRequest("PATCH", href, headers, body);

// ---------------------------------------------------------------------------
// RAG context
// ---------------------------------------------------------------------------

async function fetchRagContext(apiBase, headers, query, projectId) {
  try {
    const res = await httpGet(
      `${apiBase}/docs/search?q=${encodeURIComponent(query)}&mode=chunks&limit=3${projectId ? `&projectId=${projectId}` : ""}`,
      headers
    );
    const chunks = res.data || [];
    if (!Array.isArray(chunks) || chunks.length === 0) return "";

    const parts = chunks.map((c, i) => `### Doc ${i + 1}: ${c.docTitle || "Unknown"}\n${c.content}`);
    return `\n## Relevant Documentation\n\n${parts.join("\n\n")}`;
  } catch {
    return ""; // RAG is optional
  }
}

// ---------------------------------------------------------------------------
// Agent registration & heartbeat
// ---------------------------------------------------------------------------

const agentRegistryIds = {}; // agentName -> agentId

async function registerAgent(apiBase, headers, agent) {
  try {
    const res = await httpPost(`${apiBase}/agents`, headers, {
      name: agent.name,
      type: "RUNNER",
      tool: agent.tool,
      workdir: agent.workdir,
    });
    const id = res.data?.id;
    if (id) agentRegistryIds[agent.name] = id;
    return id;
  } catch {
    return null;
  }
}

async function sendHeartbeat(apiBase, headers, agent, status) {
  const agentId = agentRegistryIds[agent.name];
  if (!agentId) return;
  try {
    await httpPost(`${apiBase}/agents/${agentId}/heartbeat`, headers, { status });
  } catch {
    // heartbeat endpoint may fail silently
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(task, agent, ragContext) {
  const parts = [];

  // System context
  if (agent.context) {
    parts.push(agent.context);
  }

  // RAG context
  if (ragContext) {
    parts.push(ragContext);
  }

  // Task
  parts.push(`\n## Task: ${task.title}`);
  if (task.description) {
    parts.push(`\n### Description\n${task.description}`);
  }
  parts.push(`\nTask ID: ${task.id}`);
  parts.push(`Priority: ${task.priority || "MEDIUM"}`);
  parts.push(`Type: ${task.type || "TASK"}`);

  if (agent.workdir) {
    parts.push(`\nWorking directory: ${agent.workdir}`);
  }

  parts.push("\n## Instructions");
  parts.push("- Execute the task described above.");
  parts.push("- If you modify code, commit your changes.");
  parts.push("- Post a summary of what you did.");

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Agent tool executors
// ---------------------------------------------------------------------------

function shellQuote(str) {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

function runClaudeCode(task, agent, ragContext) {
  const prompt = buildPrompt(task, agent, ragContext);
  const cwd = agent.workdir || process.cwd();
  const timeout = (parseInt(agent.timeout) || 300) * 1000;

  console.log(`  [runner] Spawning claude in ${cwd} (timeout: ${timeout / 1000}s)`);

  try {
    const output = execSync(`claude -p ${shellQuote(prompt)} --output-format text`, {
      cwd,
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true, output: stripAnsi(output.toString()).trim() };
  } catch (err) {
    const stdout = stripAnsi(err.stdout?.toString() || "");
    const stderr = stripAnsi(err.stderr?.toString() || "");
    return {
      success: false,
      output: `${stdout}\n${stderr}`.trim(),
      exitCode: err.status,
    };
  }
}

function runOpencode(task, agent, ragContext) {
  const prompt = buildPrompt(task, agent, ragContext);
  const cwd = agent.workdir || process.cwd();
  const timeout = (parseInt(agent.timeout) || 300) * 1000;

  const tmpFile = path.join(os.tmpdir(), `fluxo-runner-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, prompt, "utf-8");

  try {
    const output = execSync(`opencode run "$(cat ${shellQuote(tmpFile)})"`, {
      cwd,
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    fs.unlinkSync(tmpFile);
    return { success: true, output: stripAnsi(output.toString()).trim() };
  } catch (err) {
    fs.unlinkSync(tmpFile);
    const stdout = stripAnsi(err.stdout?.toString() || "");
    const stderr = stripAnsi(err.stderr?.toString() || "");
    return {
      success: false,
      output: `${stdout}\n${stderr}`.trim(),
      exitCode: err.status,
    };
  }
}

// ---------------------------------------------------------------------------
// Core: poll → claim → execute → post → handoff
// ---------------------------------------------------------------------------

async function pollAndExecute(agent, config) {
  const apiBase = config.runner.api_url;
  const apiKey = process.env[config.runner.api_key_env];

  if (!apiKey) {
    console.error(`  [${agent.name}] ERROR: env var ${config.runner.api_key_env} not set`);
    return;
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": `FluXo-Runner/${VERSION}`,
    "X-Agent-Name": agent.name,
  };

  // Heartbeat: BUSY
  await sendHeartbeat(apiBase, headers, agent, "BUSY");

  // Step 1: Poll
  const pickStatus = agent.pick_status || "TODO";
  const assigneeId = agent.assignee_id;
  const projectId = agent.project_id;
  let pollUrl = `${apiBase}/tasks?status=${pickStatus}&limit=5`;
  if (assigneeId) pollUrl += `&assigneeId=${assigneeId}`;
  if (projectId) pollUrl += `&projectId=${projectId}`;
  console.log(`\n[${agent.name}] Polling (${pollUrl.replace(apiBase, '')})`);

  let tasks;
  try {
    const res = await httpGet(pollUrl, headers);
    tasks = res.data || res;
    if (!Array.isArray(tasks)) tasks = [];
  } catch (err) {
    console.error(`  [${agent.name}] Poll error: ${err.message}`);
    await sendHeartbeat(apiBase, headers, agent, "ONLINE");
    return;
  }

  if (tasks.length === 0) {
    console.log(`  [${agent.name}] No tasks found.`);
    await sendHeartbeat(apiBase, headers, agent, "ONLINE");
    return;
  }

  const task = tasks[0];
  console.log(`  [${agent.name}] Found: "${task.title}" (${task.id?.slice(0, 8)}...)`);

  // Step 2: Claim
  const claimStatus = agent.claim_status || "DOING";
  console.log(`  [${agent.name}] Claiming → ${claimStatus}`);
  activeTask = { task, agent };

  try {
    await httpPatch(`${apiBase}/tasks/${task.id}`, headers, { status: claimStatus });
  } catch (err) {
    console.error(`  [${agent.name}] Claim error: ${err.message}`);
    activeTask = null;
    return;
  }

  // Post "started" comment
  try {
    await httpPost(`${apiBase}/tasks/${task.id}/comments`, headers, {
      content: `[FluXo Runner][${agent.name}] Task claimed. Starting execution with ${agent.tool}...`,
    });
  } catch { /* non-critical */ }

  // Step 3: Fetch RAG context
  console.log(`  [${agent.name}] Fetching RAG context...`);
  const ragContext = await fetchRagContext(apiBase, headers, task.title, task.projectId);

  // Step 4: Execute
  console.log(`  [${agent.name}] Executing with ${agent.tool}...`);
  const startTime = Date.now();

  let result;
  switch (agent.tool) {
    case "claude":
      result = runClaudeCode(task, agent, ragContext);
      break;
    case "opencode":
      result = runOpencode(task, agent, ragContext);
      break;
    default:
      result = { success: false, output: `Unknown tool: ${agent.tool}` };
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  [${agent.name}] ${result.success ? "SUCCESS" : "FAILED"} in ${elapsed}s`);

  // Step 5: Post result
  const maxLen = 4000;
  const truncated = result.output.length > maxLen;
  const output = result.output.slice(0, maxLen);

  const summary = result.success
    ? `[FluXo Runner][${agent.name}] Completed in ${elapsed}s.\n\n${output}${truncated ? "\n\n*(output truncated — full log available locally)*" : ""}`
    : `[FluXo Runner][${agent.name}] FAILED in ${elapsed}s (exit: ${result.exitCode}).\n\n${output}${truncated ? "\n\n*(output truncated)*" : ""}`;

  try {
    await httpPost(`${apiBase}/tasks/${task.id}/comments`, headers, { content: summary });
  } catch (err) {
    console.error(`  [${agent.name}] Comment error: ${err.message}`);
  }

  // Step 6: Handoff
  const doneStatus = result.success ? (agent.done_status || "DONE") : "BLOCKED";
  const patchBody = { status: doneStatus };
  if (result.success && agent.next_assignee_id) {
    patchBody.assigneeId = agent.next_assignee_id;
  }

  console.log(`  [${agent.name}] Handoff → ${doneStatus}`);
  try {
    await httpPatch(`${apiBase}/tasks/${task.id}`, headers, patchBody);
  } catch (err) {
    console.error(`  [${agent.name}] Handoff error: ${err.message}`);
  }

  activeTask = null;
  await sendHeartbeat(apiBase, headers, agent, "ONLINE");
  console.log(`  [${agent.name}] Task complete.`);
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function gracefulShutdown(config, signal) {
  console.log(`\n[runner] ${signal} received, shutting down...`);

  const apiKey = process.env[config.runner.api_key_env];
  if (!apiKey) process.exit(0);

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": `FluXo-Runner/${VERSION}`,
  };

  // If task in progress, mark as BLOCKED
  if (activeTask) {
    const { task, agent } = activeTask;
    console.log(`  [${agent.name}] Aborting active task ${task.id?.slice(0, 8)}...`);
    try {
      await httpPatch(`${config.runner.api_url}/tasks/${task.id}`, headers, {
        status: "BLOCKED",
        blockReason: "Runner stopped",
      });
    } catch { /* best effort */ }
  }

  // Set all agents OFFLINE
  for (const agent of config.agents) {
    await sendHeartbeat(config.runner.api_url, headers, agent, "OFFLINE");
  }

  console.log("[runner] Goodbye.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const configPath = process.argv.find((a) => a.startsWith("--config="))
    ? process.argv.find((a) => a.startsWith("--config=")).split("=")[1]
    : path.join(__dirname, "config.yaml");

  const configIdx = process.argv.indexOf("--config");
  const finalConfigPath = configIdx > -1 ? process.argv[configIdx + 1] : configPath;

  if (!fs.existsSync(finalConfigPath)) {
    console.error(`Config not found: ${finalConfigPath}`);
    console.error(`Usage: node runner.js [--config path/to/config.yaml] [--once]`);
    process.exit(1);
  }

  const config = loadConfig(finalConfigPath);

  console.log(`╔══════════════════════════════════════╗`);
  console.log(`║     FluXo Runner MVP v${VERSION}        ║`);
  console.log(`╚══════════════════════════════════════╝`);
  console.log(`  API: ${config.runner.api_url}`);
  console.log(`  Agents: ${config.agents.map((a) => `${a.name} (${a.tool})`).join(", ")}`);
  console.log(`  Poll: every ${config.runner.poll_interval_sec || 30}s`);
  console.log("");

  // Register agents
  const apiKey = process.env[config.runner.api_key_env];
  if (apiKey) {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": `FluXo-Runner/${VERSION}`,
      "X-Agent-Name": "fluxo-runner",
    };

    console.log("[runner] Registering agents...");
    for (const agent of config.agents) {
      const id = await registerAgent(config.runner.api_url, headers, agent);
      console.log(`  ${agent.name}: ${id ? `registered (${id.slice(0, 8)}...)` : "failed (will retry)"}`);
    }
    console.log("");
  }

  // Graceful shutdown handlers
  const once = process.argv.includes("--once");

  if (!once) {
    process.on("SIGINT", () => gracefulShutdown(config, "SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown(config, "SIGTERM"));
  }

  // Single run mode
  if (once) {
    for (const agent of config.agents) {
      await pollAndExecute(agent, config);
    }
    return;
  }

  // Continuous mode
  const pollInterval = (parseInt(config.runner.poll_interval_sec) || 30) * 1000;
  console.log(`Running in continuous mode. Press Ctrl+C to stop.\n`);

  const loop = async () => {
    try {
      for (const agent of config.agents) {
        await pollAndExecute(agent, config);
      }
    } catch (err) {
      console.error(`[runner] Error: ${err.message}`);
    }
  };

  await loop();
  setInterval(loop, pollInterval);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
