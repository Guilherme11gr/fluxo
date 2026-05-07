import { PrismaClient } from '@prisma/client';
import { NotFoundError } from '@/shared/errors';

export interface PersonalBoardTagInfo {
  id: string;
  name: string;
  color: string;
}

export interface PersonalBoardTag extends PersonalBoardTagInfo {
  orgId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePersonalBoardTagInput {
  name: string;
  color?: string;
}

export interface UpdatePersonalBoardTagInput {
  name?: string;
  color?: string;
}

export class PersonalBoardTagRepository {
  constructor(private prisma: PrismaClient) {}

  async list(orgId: string, userId: string): Promise<PersonalBoardTag[]> {
    return this.prisma.personalBoardItemTag.findMany({
      where: { orgId, userId },
      orderBy: { name: 'asc' },
    });
  }

  async create(orgId: string, userId: string, input: CreatePersonalBoardTagInput): Promise<PersonalBoardTag> {
    return this.prisma.personalBoardItemTag.create({
      data: {
        orgId,
        userId,
        name: input.name,
        color: input.color ?? '#6366f1',
      },
    });
  }

  async update(id: string, orgId: string, userId: string, input: UpdatePersonalBoardTagInput): Promise<PersonalBoardTag> {
    const existing = await this.prisma.personalBoardItemTag.findFirst({
      where: { id, orgId, userId },
    });
    if (!existing) {
      throw new NotFoundError('Tag pessoal não encontrada');
    }

    return this.prisma.personalBoardItemTag.update({
      where: { id },
      data: {
        name: input.name,
        color: input.color,
      },
    });
  }

  async delete(id: string, orgId: string, userId: string): Promise<void> {
    const existing = await this.prisma.personalBoardItemTag.findFirst({
      where: { id, orgId, userId },
    });
    if (!existing) {
      throw new NotFoundError('Tag pessoal não encontrada');
    }

    await this.prisma.personalBoardItemTag.delete({
      where: { id },
    });
  }

  async getTagsForItem(itemId: string): Promise<PersonalBoardTagInfo[]> {
    const assignments = await this.prisma.personalBoardItemTagAssignment.findMany({
      where: { itemId },
      select: {
        tag: {
          select: { id: true, name: true, color: true },
        },
      },
    });
    return assignments.map((a) => a.tag);
  }

  async assignToItem(itemId: string, tagIds: string[], orgId: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Validate item exists and belongs to user
      const item = await tx.personalBoardItem.findFirst({
        where: {
          id: itemId,
          column: { orgId, userId },
        },
        select: { id: true },
      });
      if (!item) {
        throw new NotFoundError('Item do quadro pessoal não encontrado');
      }

      // Validate tags belong to user
      if (tagIds.length > 0) {
        const validTagCount = await tx.personalBoardItemTag.count({
          where: { id: { in: tagIds }, userId, orgId },
        });
        if (validTagCount !== tagIds.length) {
          throw new NotFoundError('Uma ou mais tags são inválidas');
        }
      }

      // Replace all assignments
      await tx.personalBoardItemTagAssignment.deleteMany({ where: { itemId } });
      if (tagIds.length > 0) {
        await tx.personalBoardItemTagAssignment.createMany({
          data: tagIds.map((tagId) => ({ itemId, tagId })),
          skipDuplicates: true,
        });
      }
    });
  }
}
