/**
 * Web UI API - Available Models
 *
 * GET /api/agents/models - Returns available models from all online agents in the org.
 * This aggregates `available_models` from agent config fields, providing
 * dynamic model suggestions for agent configuration forms.
 */

import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { agentRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);
    const agents = await agentRepository.findByOrgId(tenantId);

    const modelsSet = new Set<string>();
    for (const agent of agents) {
      const config = agent.config as Record<string, unknown> ?? {};
      const availableModels = config.available_models;
      if (Array.isArray(availableModels)) {
        for (const m of availableModels) {
          if (typeof m === 'string') {
            modelsSet.add(m);
          }
        }
      }
      // Also include the agent's own model if set
      if (typeof config.model === 'string' && config.model) {
        modelsSet.add(config.model);
      }
    }

    const models = Array.from(modelsSet).sort();
    return Response.json({ data: models });
  } catch {
    return Response.json({ error: 'Failed to fetch models' }, { status: 500 });
  }
}