import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { aiAdapter } from '@/infra/adapters/ai';
import { epicRepository, featureRepository } from '@/infra/adapters/prisma';
import { generateEpicSummary } from '@/domain/use-cases/ai/generate-epic-summary';

// Schemas
const bodySchema = z.object({
    epicId: z.string().uuid(),
});

export const POST = async (req: NextRequest) => {
    try {
        const supabase = await createClient();
        const { tenantId } = await extractAuthenticatedTenant(supabase);
        const body = await req.json();
        const { epicId } = bodySchema.parse(body);

        const result = await generateEpicSummary(
            { epicId, orgId: tenantId },
            { aiAdapter, epicRepository, featureRepository }
        );

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Error generating epic summary:', error);
        return NextResponse.json(
            { message: error.message || 'Falha ao gerar resumo' },
            { status: error.status || 500 }
        );
    }
};
