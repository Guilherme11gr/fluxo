import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/adapters/prisma';
import { getMockAuthContext } from '@/lib/mock-auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getMockAuthContext();
    if (!auth?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const command = await prisma.kaiCommand.findUnique({
      where: { id },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true
          }
        },
        project: {
          select: {
            id: true,
            name: true,
            githubRepoUrl: true
          }
        }
      }
    });

    if (!command) {
      return NextResponse.json({ error: 'Command not found' }, { status: 404 });
    }

    return NextResponse.json(command);

  } catch (error) {
    console.error('Error fetching command:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
