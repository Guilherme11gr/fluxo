import type { PrismaClient } from '@prisma/client';

export interface PersonalNote {
  id: string;
  orgId: string;
  userId: string;
  content: string;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePersonalNoteInput {
  orgId: string;
  userId: string;
  content: string;
  isPinned?: boolean;
}

export interface UpdatePersonalNoteInput {
  content?: string;
  isPinned?: boolean;
}

export class PersonalNoteRepository {
  constructor(private prisma: PrismaClient) {}

  async findAll(orgId: string, userId: string): Promise<PersonalNote[]> {
    return this.prisma.personalNote.findMany({
      where: { orgId, userId },
      orderBy: [
        { isPinned: 'desc' },
        { updatedAt: 'desc' },
      ],
    });
  }

  async create(data: CreatePersonalNoteInput): Promise<PersonalNote> {
    return this.prisma.personalNote.create({
      data: {
        orgId: data.orgId,
        userId: data.userId,
        content: data.content,
        isPinned: data.isPinned ?? false,
      },
    });
  }

  async update(id: string, orgId: string, userId: string, data: UpdatePersonalNoteInput): Promise<PersonalNote> {
    const existing = await this.prisma.personalNote.findFirst({
      where: { id, orgId, userId },
    });

    if (!existing) {
      throw new Error('Nota não encontrada');
    }

    const prismaData: Record<string, unknown> = {};
    if (data.content !== undefined) prismaData.content = data.content;
    if (data.isPinned !== undefined) prismaData.isPinned = data.isPinned;

    return this.prisma.personalNote.update({
      where: { id },
      data: prismaData,
    });
  }

  async delete(id: string, orgId: string, userId: string): Promise<void> {
    const existing = await this.prisma.personalNote.findFirst({
      where: { id, orgId, userId },
    });

    if (!existing) {
      throw new Error('Nota não encontrada');
    }

    await this.prisma.personalNote.delete({
      where: { id },
    });
  }
}
