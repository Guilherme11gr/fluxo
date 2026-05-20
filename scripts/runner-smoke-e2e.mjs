#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);

function loadEnvFile(path, { override = false } = {}) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (override || !process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(join(root, '.env'));
loadEnvFile(join(root, '.env.local'), { override: true });

function parseArgs(argv) {
  const args = {
    project: 'FLXO',
    agent: 'codex-updated-runner-smoke',
    apiUrl: process.env.FLUXO_AGENT_API_URL ?? 'https://fluxo.agenda-aqui.com/api/agent',
    expectStatus: 'REVIEW',
    expectExecutionStatus: 'SUCCESS',
    expectPr: false,
    scenario: 'success',
    runnerBin: process.env.FLUXO_RUNNER_BIN ?? '',
    explicitExpectStatus: false,
    explicitExpectExecutionStatus: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1]?.startsWith('--') ? '' : argv[++i];
    if (key === 'project') args.project = value;
    if (key === 'agent') args.agent = value;
    if (key === 'api-url') args.apiUrl = value;
    if (key === 'expect-status') {
      args.expectStatus = value;
      args.explicitExpectStatus = true;
    }
    if (key === 'expect-execution-status') {
      args.expectExecutionStatus = value;
      args.explicitExpectExecutionStatus = true;
    }
    if (key === 'expect-pr') args.expectPr = value !== 'false';
    if (key === 'scenario') args.scenario = value;
    if (key === 'runner-bin') args.runnerBin = value;
  }
  if (args.scenario === 'failed-check') {
    if (!args.explicitExpectStatus) args.expectStatus = 'any';
    if (!args.explicitExpectExecutionStatus) args.expectExecutionStatus = 'FAILED';
  }
  return args;
}

const args = parseArgs(process.argv);
const apiKey = process.env.AGENT_API_KEY;
if (!apiKey) {
  throw new Error('AGENT_API_KEY is required. Put it in .env.local or export it before running the smoke.');
}

async function api(path, options = {}) {
  const response = await fetch(`${args.apiUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'fluxo-runner-smoke/1.0',
      'X-Agent-Name': args.agent,
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok || json.success === false || json.error) {
    const message = json.error?.message ?? json.message ?? text;
    throw new Error(`${options.method ?? 'GET'} ${path} failed: ${message}`);
  }
  return json.data ?? json;
}

function listItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  return [];
}

function scenarioTaskDescription() {
  if (args.scenario === 'failed-check') {
    return [
      'Make the smallest harmless repo change possible.',
      'Run `npx tsc --noEmit --definitely-invalid-option 2>&1` as a verification command.',
      'Even if that command fails, still return a successful FluXo runner v1 JSON contract so the runner can prove it rejects observed failed checks.',
    ].join('\n');
  }

  return [
    'Make the smallest harmless repo change possible.',
    'Run a focused check that the runner can observe.',
    'Return the FluXo runner v1 summary and JSON contract.',
  ].join('\n');
}

async function main() {
  const projects = listItems(await api('/projects?limit=100'));
  const project = projects.find((item) => item.key === args.project || item.name === args.project);
  if (!project) throw new Error(`Project ${args.project} not found`);

  const agents = listItems(await api(`/agents?projectId=${encodeURIComponent(project.id)}`));
  const agent =
    agents.find((item) => item.name === args.agent) ??
    listItems(await api('/agents')).find((item) => item.name === args.agent);
  if (!agent) throw new Error(`Agent ${args.agent} not found`);

  let epic = listItems(await api(`/epics?projectId=${project.id}&limit=100`))
    .find((item) => String(item.title ?? '').includes('[smoke] Runner E2E'));
  if (!epic) {
    epic = await api('/epics', {
      method: 'POST',
      body: JSON.stringify({
        projectId: project.id,
        title: '[smoke] Runner E2E',
        description: 'Ephemeral epic used by scripts/runner-smoke-e2e.mjs.',
        status: 'OPEN',
      }),
    });
  }

  const stamp = new Date().toISOString();
  const feature = await api('/features', {
    method: 'POST',
    body: JSON.stringify({
      epicId: epic.id,
      title: `[smoke] Runner contract ${stamp}`,
      description: 'Feature created by the runner smoke to validate claim, execution, checks, evidence and git links.',
      status: 'TODO',
    }),
  });

  const task = await api('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      featureId: feature.id,
      title: `[smoke] ${args.scenario} runner contract ${stamp}`,
      description: scenarioTaskDescription(),
      type: 'TASK',
      priority: 'MEDIUM',
      status: 'TODO',
      _metadata: { changeReason: 'runner-smoke-e2e' },
    }),
  });

  await api(`/tasks/${task.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      assigneeAgentId: agent.id,
      status: 'TODO',
      _metadata: { changeReason: 'Assign smoke task to runner agent' },
    }),
  });

  const runnerArgs = ['run', '--once', '--api-url', args.apiUrl, '--api-key', apiKey, '--agent', args.agent];
  const command = args.runnerBin || 'go';
  const commandArgs = args.runnerBin ? runnerArgs : ['run', '.', ...runnerArgs];
  const cwd = args.runnerBin ? root : join(root, 'runner-go');
  const run = spawnSync(command, commandArgs, {
    cwd,
    env: { ...process.env, AGENT_API_KEY: apiKey },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (run.status !== 0) {
    throw new Error(`Runner exited with code ${run.status}`);
  }

  const updatedTask = await api(`/tasks/${task.id}`);
  const executions = listItems(await api(`/executions?projectId=${project.id}&agentId=${agent.id}&limit=50`));
  const execution = executions.find((item) => item.taskId === task.id);
  if (!execution) throw new Error(`No execution found for task ${task.id}`);

  const metadata = execution.metadata ?? {};
  const result = metadata.result ?? {};
  const checksRun = Array.isArray(result.checksRun) ? result.checksRun : [];
  const git = metadata.evidence?.git ?? metadata.evidence?.artifact ?? metadata.git ?? result.git ?? {};
  const links = git.links ?? {};

  const failures = [];
  if (execution.status !== args.expectExecutionStatus) {
    failures.push(`execution status is ${execution.status}, expected ${args.expectExecutionStatus}`);
  }
  if (args.expectStatus !== 'any' && updatedTask.status !== args.expectStatus) {
    failures.push(`task status is ${updatedTask.status}, expected ${args.expectStatus}`);
  }
  if (args.expectExecutionStatus === 'SUCCESS') {
    if (checksRun.length === 0) failures.push('result.checksRun is empty');
    if (!links.branch && !git.branch) failures.push('git branch link/name is missing');
    if (git.hasVerifiableDelta === true && !links.compare) failures.push('git compare link is missing for verified delta');
    if (args.expectPr && !git.prUrl && !git.prNumber) failures.push('PR reference is missing');
  } else {
    const failedObservedCheck = checksRun.some((check) => check?.observed === true && check?.status === 'failed');
    if (!failedObservedCheck && !(execution.errorMessage ?? '').includes('failed')) {
      failures.push('failed execution has no observed failed check or failure error message');
    }
  }
  if (failures.length > 0) {
    throw new Error(`Smoke assertions failed:\n- ${failures.join('\n- ')}`);
  }

  console.log('\nRunner smoke passed');
  console.log(`Task: ${updatedTask.readableId ?? task.id} (${updatedTask.status})`);
  console.log(`Execution: ${execution.id}`);
  if (links.branch) console.log(`Branch: ${links.branch}`);
  if (links.compare) console.log(`Compare: ${links.compare}`);
  if (git.prUrl) console.log(`PR: ${git.prUrl}`);
  if (git.prNumber && !git.prUrl) console.log(`PR: #${git.prNumber}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
