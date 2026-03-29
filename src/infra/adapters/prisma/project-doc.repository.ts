/**
 * ProjectDoc Repository - Prisma Adapter
 */
import type { PrismaClient, ProjectDoc as PrismaProjectDoc } from '@prisma/client';

export interface ProjectDoc {
  id: string;
  projectId: string;
  title: string;
  content?: string;
  createdAt: Date;
  updatedAt: Date;
  tags?: Array<{
    tag: {
      id: string;
      name: string;
    };
  }>;
}

export interface CreateProjectDocInput {
  orgId: string;
  projectId: string;
  title: string;
  content: string;
  tagIds?: string[];
}

export interface UpdateProjectDocInput {
  title?: string;
  content?: string;
  tagIds?: string[];
}

export class ProjectDocRepository {
  constructor(private prisma: PrismaClient) { }

  /**
   * Create a new project doc
   */
  async create(data: CreateProjectDocInput): Promise<ProjectDoc> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Create doc
      const doc = await tx.projectDoc.create({
        data: {
          orgId: data.orgId,
          projectId: data.projectId,
          title: data.title,
          content: data.content,
        },
      });

      // 2. Validate and assign tags (if provided)
      if (data.tagIds && data.tagIds.length > 0) {
        // Validate tags belong to same project and org
        const validTagCount = await tx.projectTag.count({
          where: {
            id: { in: data.tagIds },
            projectId: data.projectId,
            orgId: data.orgId,
          },
        });

        if (validTagCount !== data.tagIds.length) {
          throw new Error('Uma ou mais tags não pertencem a este projeto');
        }

        // Create tag assignments
        await tx.docTagAssignment.createMany({
          data: data.tagIds.map((tagId) => ({
            docId: doc.id,
            tagId,
          })),
          skipDuplicates: true,
        });
      }

      return doc;
    });
  }

  /**
   * Find all docs for a project
   */
  async findByProjectId(projectId: string, orgId: string): Promise<ProjectDoc[]> {
    return this.prisma.projectDoc.findMany({
      where: {
        projectId,
        orgId,
      },
      select: {
        id: true,
        projectId: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        // Exclude content for performance
        tags: {
          select: {
            tag: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  /**
   * Find doc by ID
   */
  async findById(id: string, orgId: string): Promise<ProjectDoc | null> {
    return this.prisma.projectDoc.findFirst({
      where: { id, orgId },
    });
  }

  /**
   * Find doc by ID with tags included
   */
  async findByIdWithTags(id: string, orgId: string) {
    return this.prisma.projectDoc.findFirst({
      where: { id, orgId },
      include: {
        tags: {
          select: {
            tag: {
              select: { id: true, name: true }
            }
          }
        },
      },
    });
  }

  /**
   * Update a project doc
   */
  async update(id: string, orgId: string, data: UpdateProjectDocInput): Promise<ProjectDoc> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Verify doc exists and get projectId
      const existing = await tx.projectDoc.findFirst({
        where: { id, orgId },
        select: { id: true, projectId: true },
      });

      if (!existing) {
        throw new Error('ProjectDoc not found');
      }

      // 2. Update doc fields
      const { tagIds, ...docData } = data;
      const doc = await tx.projectDoc.update({
        where: { id },
        data: docData,
      });

      // 3. Update tags if provided
      if (tagIds !== undefined) {
        // Validate tags belong to same project and org
        if (tagIds.length > 0) {
          const validTagCount = await tx.projectTag.count({
            where: {
              id: { in: tagIds },
              projectId: existing.projectId,
              orgId,
            },
          });

          if (validTagCount !== tagIds.length) {
            throw new Error('Uma ou mais tags não pertencem a este projeto');
          }
        }

        // Replace all tag assignments atomically
        await tx.docTagAssignment.deleteMany({ where: { docId: id } });

        if (tagIds.length > 0) {
          await tx.docTagAssignment.createMany({
            data: tagIds.map((tagId) => ({ docId: id, tagId })),
            skipDuplicates: true,
          });
        }
      }

      return doc;
    });
  }

  /**
   * Delete a doc
   */
  async delete(id: string, orgId: string): Promise<void> {
    // Verify belongs to org before delete
    const existing = await this.findById(id, orgId);
    if (!existing) {
      throw new Error('ProjectDoc not found');
    }

    await this.prisma.projectDoc.delete({
      where: { id },
    });
  }

  /**
   * Count docs for a project
   */
  async countByProjectId(projectId: string, orgId: string): Promise<number> {
    return this.prisma.projectDoc.count({
      where: { projectId, orgId },
    });
  }

  /**
   * Find docs for AI context (limited by character count)
   * Returns docs ordered by most recent, with content limited to maxTotalChars
   */
  async findForAIContext(
    projectId: string,
    orgId: string,
    maxTotalChars: number = 4000
  ): Promise<Array<{ title: string; content: string }>> {
    const docs = await this.prisma.projectDoc.findMany({
      where: { projectId, orgId },
      select: { title: true, content: true },
      orderBy: { updatedAt: 'desc' },
    });

    // Limit total characters across all docs
    const result: Array<{ title: string; content: string }> = [];
    let totalChars = 0;

    for (const doc of docs) {
      const docChars = doc.title.length + doc.content.length + 10; // +10 for separators

      if (totalChars + docChars > maxTotalChars) {
        // Check if we can add a truncated version
        const remainingChars = maxTotalChars - totalChars - doc.title.length - 20;
        if (remainingChars > 100) {
          result.push({
            title: doc.title,
            content: doc.content.substring(0, remainingChars) + '...',
          });
        }
        break;
      }

      result.push({ title: doc.title, content: doc.content });
      totalChars += docChars;
    }

    return result;
  }

  /**
   * Find docs by specific IDs for AI context
   * Used when user selects specific docs to include
   */
  async findByIds(
    ids: string[],
    orgId: string,
    maxTotalChars: number = 4000
  ): Promise<Array<{ title: string; content: string }>> {
    if (ids.length === 0) return [];

    const docs = await this.prisma.projectDoc.findMany({
      where: { id: { in: ids }, orgId },
      select: { title: true, content: true },
      orderBy: { updatedAt: 'desc' },
    });

    // Apply same character limit logic
    const result: Array<{ title: string; content: string }> = [];
    let totalChars = 0;

    for (const doc of docs) {
      const docChars = doc.title.length + doc.content.length + 10;

      if (totalChars + docChars > maxTotalChars) {
        const remainingChars = maxTotalChars - totalChars - doc.title.length - 20;
        if (remainingChars > 100) {
          result.push({
            title: doc.title,
            content: doc.content.substring(0, remainingChars) + '...',
          });
        }
        break;
      }

      result.push({ title: doc.title, content: doc.content });
      totalChars += docChars;
    }

    return result;
  }

  /**
   * JKILL-63: Generate a share token and enable public sharing for a doc
   * @param docId - The ID of the doc to share
   * @param orgId - The organization ID (for security check)
   * @param userId - The ID of the user enabling sharing (for audit trail)
   * @param expiresIn - Optional expiration time in milliseconds (default: 30 days)
   * @returns The generated share token
   */
  async generateShareToken(
    docId: string,
    orgId: string,
    userId: string,
    expiresIn?: number
  ): Promise<string> {
    // Check if already shared - return existing token if still valid
    const existing = await this.prisma.projectDoc.findFirst({
      where: { id: docId, orgId },
      select: { id: true, shareToken: true, isPublic: true, shareExpiresAt: true },
    });

    if (!existing) {
      throw new Error('Doc not found');
    }

    // If already shared and token is still valid, return existing token
    if (existing.isPublic && existing.shareToken) {
      if (!existing.shareExpiresAt || existing.shareExpiresAt > new Date()) {
        return existing.shareToken; // Return existing valid token
      }
      // Token expired, will regenerate below
    }

    // Calculate expiration (default 30 days)
    const shareExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Generate new token
    const shareToken = crypto.randomUUID();

    // Update doc with share token and enable public sharing
    await this.prisma.projectDoc.update({
      where: { id: docId },
      data: {
        shareToken,
        isPublic: true,
        sharedAt: new Date(),
        shareExpiresAt,
        sharedBy: userId,
      },
    });

    return shareToken;
  }

  /**
   * JKILL-63: Disable public sharing for a doc
   * @param docId - The ID of the doc to stop sharing
   * @param orgId - The organization ID (for security check)
   */
  async disableSharing(docId: string, orgId: string): Promise<void> {
    // Verify doc exists and belongs to org
    const doc = await this.prisma.projectDoc.findFirst({
      where: { id: docId, orgId },
      select: { id: true },
    });

    if (!doc) {
      throw new Error('Doc not found');
    }

    // Remove share token and disable public sharing
    await this.prisma.projectDoc.update({
      where: { id: docId },
      data: {
        shareToken: null,
        isPublic: false,
        sharedAt: null,
        shareExpiresAt: null,
        sharedBy: null,
      },
    });
  }

  /**
   * JKILL-63: Find a publicly shared doc by its share token
   * Used for public access without authentication
   * @param token - The share token
   * @returns The doc with project info, or null if not found/not public/expired
   */
  async findByShareToken(token: string): Promise<{
    id: string;
    title: string;
    content: string;
    projectName: string;
    sharedAt: Date | null;
  } | null> {
    const doc = await this.prisma.projectDoc.findUnique({
      where: { shareToken: token },
      select: {
        id: true,
        title: true,
        content: true,
        isPublic: true,
        sharedAt: true,
        shareExpiresAt: true,
        project: {
          select: {
            name: true,
          },
        },
      },
    });

    // Only return if doc exists, is marked as public, and not expired
    if (!doc || !doc.isPublic) {
      return null;
    }

    // Check if token has expired
    if (doc.shareExpiresAt && doc.shareExpiresAt < new Date()) {
      return null;
    }

    return {
      id: doc.id,
      title: doc.title,
      content: doc.content,
      projectName: doc.project.name,
      sharedAt: doc.sharedAt,
    };
  }
}

