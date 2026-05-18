const fs = require('fs');

function loadEnvRaw(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const env = {};

  for (const line of text.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

async function main() {
  const [, , methodArg, pathArg, bodyArg] = process.argv;
  const method = (methodArg || 'GET').toUpperCase();
  const path = pathArg || '/';
  const env = loadEnvRaw('.env.local');
  const apiKey = env.AGENT_API_KEY;

  if (!apiKey) {
    throw new Error('AGENT_API_KEY not found in .env.local');
  }

  const baseUrl = (env.AGENT_API_URL || 'https://fluxo.agenda-aqui.com/api/agent').replace(/\/$/, '');
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'X-Agent-Name': 'opencode',
    'User-Agent': 'FluXo-Runner/0.3.0',
    Accept: 'application/json',
  };

  const init = { method, headers };

  if (bodyArg !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = bodyArg;
  }

  const response = await fetch(url, init);
  const text = await response.text();

  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Keep raw text when response is not JSON.
  }

  process.stdout.write(JSON.stringify({
    status: response.status,
    ok: response.ok,
    body,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
