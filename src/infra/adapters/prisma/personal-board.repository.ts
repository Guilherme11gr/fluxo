import type { PrismaClient } from '@prisma/client';

export interface PersonalBoardColumn {
  id: string;
  orgId: string;
  userId: string;
  title: string;
  color: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
  items: PersonalBoardItem[];
}

export interface PersonalBoardItem {
  id: string;
  columnId: string;
  title: string;
  description: string | null;
  priority: string | null;
  dueDate: Date | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateColumnInput {
  orgId: string;
  userId: string;
  title: string;
  color?: string;
}

export interface UpdateColumnInput {
  title?: string;
  color?: string;
  order?: number;
}

export interface CreateItemInput {
  columnId: string;
  title: string;
  description?: string;
  priority?: string;
  dueDate?: string | Date | null;
}

export interface UpdateItemInput {
  title?: string;
  description?: string | null;
  priority?: string | null;
  dueDate?: string | Date | null;
  columnId?: string;
  order?: number;
}

export interface MoveItemInput {
  itemId: string;
  targetColumnId: string;
  targetOrder: number;
}

export interface ReorderColumnsInput {
  columns: { id: string; order: number }[];
}

export interface ReorderItemsInput {
  items: { id: string; columnId: string; order: number }[];
}

export class PersonalBoardRepository {
  constructor(private prisma: PrismaClient) {}

  async getBoard(orgId: string, userId: string): Promise<PersonalBoardColumn[]> {
    return this.prisma.personalBoardColumn.findMany({
      where: { orgId, userId },
      include: {
        items: {
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { order: 'asc' },
    });
  }

  async createColumn(data: CreateColumnInput): Promise<PersonalBoardColumn> {
    const maxOrder = await this.prisma.personalBoardColumn.aggregate({
      where: { orgId: data.orgId, userId: data.userId },
      _max: { order: true },
    });

    return this.prisma.personalBoardColumn.create({
      data: {
        orgId: data.orgId,
        userId: data.userId,
        title: data.title,
        color: data.color || '#6366f1',
        order: (maxOrder._max.order ?? -1) + 1,
      },
      include: { items: true },
    });
  }

  async updateColumn(id: string, orgId: string, userId: string, data: UpdateColumnInput): Promise<PersonalBoardColumn> {
    const existing = await this.prisma.personalBoardColumn.findFirst({
      where: { id, orgId, userId },
    });

    if (!existing) {
      throw new Error('Coluna não encontrada');
    }

    return this.prisma.personalBoardColumn.update({
      where: { id },
      data,
      include: { items: true },
    });
  }

  async deleteColumn(id: string, orgId: string, userId: string): Promise<void> {
    const existing = await this.prisma.personalBoardColumn.findFirst({
      where: { id, orgId, userId },
    });

    if (!existing) {
      throw new Error('Coluna não encontrada');
    }

    await this.prisma.personalBoardColumn.delete({
      where: { id },
    });
  }

  async createItem(data: CreateItemInput): Promise<PersonalBoardItem> {
    const maxOrder = await this.prisma.personalBoardItem.aggregate({
      where: { columnId: data.columnId },
      _max: { order: true },
    });

    return this.prisma.personalBoardItem.create({
      data: {
        columnId: data.columnId,
        title: data.title,
        description: data.description,
        priority: data.priority,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
  }

  async updateItem(id: string, columnId: string, data: UpdateItemInput): Promise<PersonalBoardItem> {
    const existing = await this.prisma.personalBoardItem.findFirst({
      where: { id, columnId },
    });

    if (!existing) {
      throw new Error('Item não encontrado');
    }

    const prismaData: Record<string, unknown> = { ...data };
    if (prismaData.dueDate !== undefined && prismaData.dueDate !== null) {
      prismaData.dueDate = new Date(prismaData.dueDate as string);
    }

    return this.prisma.personalBoardItem.update({
      where: { id },
      data: prismaData,
    });
  }

  async deleteItem(id: string, columnId: string): Promise<void> {
    const existing = await this.prisma.personalBoardItem.findFirst({
      where: { id, columnId },
    });

    if (!existing) {
      throw new Error('Item não encontrado');
    }

    await this.prisma.personalBoardItem.delete({
      where: { id },
    });
  }

  async moveItem(data: MoveItemInput): Promise<PersonalBoardItem> {
    const item = await this.prisma.personalBoardItem.findUnique({
      where: { id: data.itemId },
    });

    if (!item) {
      throw new Error('Item não encontrado');
    }

    return this.prisma.personalBoardItem.update({
      where: { id: data.itemId },
      data: {
        columnId: data.targetColumnId,
        order: data.targetOrder,
      },
    });
  }

  async reorderColumns(orgId: string, userId: string, data: ReorderColumnsInput): Promise<void> {
    await this.prisma.$transaction(
      data.columns.map((col) =>
        this.prisma.personalBoardColumn.updateMany({
          where: { id: col.id, orgId, userId },
          data: { order: col.order },
        })
      )
    );
  }

  async reorderItems(data: ReorderItemsInput): Promise<void> {
    await this.prisma.$transaction(
      data.items.map((item) =>
        this.prisma.personalBoardItem.updateMany({
          where: { id: item.id, columnId: item.columnId },
          data: { order: item.order },
        })
      )
    );
  }
}
