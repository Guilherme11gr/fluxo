import { NextResponse } from 'next/server';
import { prisma } from '@/infra/adapters/prisma';

export async function GET() {
  try {
    // Buscar estatísticas reais do sistema
    const [
      projectCount,
      epicCount,
      taskCount,
      taskByStatus,
      criticalBugs
    ] = await Promise.all([
      prisma.project.count(),
      prisma.epic.count(),
      prisma.task.count(),
      prisma.task.groupBy({
        by: ['status'],
        _count: true
      }),
      prisma.task.count({
        where: {
          type: 'BUG',
          priority: 'CRITICAL',
          status: { not: 'DONE' }
        }
      })
    ]);

    return NextResponse.json({
      status: 'online',
      model: 'zai/glm-5',
      name: 'Luna',
      icon: '🌙',
      projects: {
        total: projectCount,
        tasks: taskCount,
        epics: epicCount
      },
      tasks: {
        byStatus: taskByStatus.reduce((acc, curr) => {
          acc[curr.status] = curr._count;
          return acc;
        }, {} as Record<string, number>),
        criticalBugs
      },
      mcp: {
        connected: true,
        tools: 27,
        server: 'jt-kill'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao buscar status:', error);
    return NextResponse.json({
      status: 'partial',
      error: 'Erro ao conectar com banco',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
