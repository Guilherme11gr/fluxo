import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/adapters/prisma';
import { getMockAuthContext } from '@/lib/mock-auth';

export async function POST(req: NextRequest) {
  try {
    const auth = await getMockAuthContext();
    if (!auth?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { taskId, commandType } = await req.json();

    if (!taskId || !commandType) {
      return NextResponse.json({ error: 'Missing taskId or commandType' }, { status: 400 });
    }

    // Busca a task e o projeto
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true }
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (!task.project.githubRepoUrl) {
      return NextResponse.json({ error: 'Project has no GitHub repo configured' }, { status: 400 });
    }

    // Cria o comando
    const command = await prisma.kaiCommand.create({
      data: {
        projectId: task.projectId,
        taskId: task.id,
        commandType: commandType.toUpperCase(),
        status: 'PENDING',
        output: 'Aguardando início...'
      }
    });

    return NextResponse.json({ 
      success: true, 
      commandId: command.id,
      status: command.status 
    });

  } catch (error) {
    console.error('Error creating command:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
