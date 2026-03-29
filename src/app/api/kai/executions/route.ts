import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/adapters/prisma';
import { getMockAuthContext } from '@/lib/mock-auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await getMockAuthContext();
    if (!auth?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const commands = await prisma.kaiCommand.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        task: {
          select: {
            id: true,
            title: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({ commands });

  } catch (error) {
    console.error('Error fetching commands:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
