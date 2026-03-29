/**
 * DocTag Repository - Prisma Adapter
 * Handles CRUD operations for document tags and their assignments
 * 
 * Note: After tag unification, this uses ProjectTag model but keeps DocTag interface
 * for backward compatibility. DocTags are just ProjectTags used in docs context.
 */
import type { PrismaClient } from '@prisma/client';

export interface DocTag {
    id: string;
    name: string;
    projectId: string;
    orgId: string;
    createdAt: Date;
}

export interface CreateDocTagInput {
    orgId: string;
    projectId: string;
    name: string;
}

export interface DocTagWithCount extends DocTag {
    _count: {
        assignments: number;
    };
}

export class DocTagRepository {
    constructor(private prisma: PrismaClient) { }

    /**
     * Create a new tag for a project
     */
    async create(data: CreateDocTagInput): Promise<DocTag> {
        return this.prisma.projectTag.create({
            data: {
                orgId: data.orgId,
                projectId: data.projectId,
                name: data.name.trim(),
                color: '#6b7280', // Default gray for doc tags
            },
        });
    }

    /**
     * Find tag by ID
     */
    async findById(id: string, orgId: string): Promise<DocTag | null> {
        return this.prisma.projectTag.findFirst({
            where: { id, orgId },
        });
    }

    /**
     * Find all tags for a project
     */
    async findByProjectId(projectId: string, orgId: string): Promise<DocTagWithCount[]> {
        const result = await this.prisma.projectTag.findMany({
            where: { projectId, orgId },
            include: {
                _count: {
                    select: { docAssignments: true },
                },
            },
            orderBy: { name: 'asc' },
        });

        // Map ProjectTag to DocTag (drop color/description fields)
        return result.map((tag): DocTagWithCount => ({
            id: tag.id,
            name: tag.name,
            projectId: tag.projectId,
            orgId: tag.orgId,
            createdAt: tag.createdAt,
            _count: {
                assignments: tag._count.docAssignments,
            },
        }));
    }

    /**
     * Find tag by name within a project (for uniqueness check)
     * Case-insensitive comparison
     */
    async findByName(name: string, projectId: string, orgId: string): Promise<DocTag | null> {
        return this.prisma.projectTag.findFirst({
            where: {
                name: {
                    equals: name.trim(),
                    mode: 'insensitive',
                },
                projectId,
                orgId,
            },
        });
    }

    /**
     * Delete a tag (assignments cascade automatically)
     * Uses deleteMany for atomic tenant-safe deletion
     */
    async delete(id: string, orgId: string): Promise<void> {
        const result = await this.prisma.projectTag.deleteMany({
            where: { id, orgId },
        });
        if (result.count === 0) {
            throw new Error('DocTag not found');
        }
    }

    /**
     * Assign a tag to a document (idempotent - ignores if already exists)
     */
    async assignToDoc(docId: string, tagId: string): Promise<void> {
        await this.prisma.docTagAssignment.upsert({
            where: {
                docId_tagId: { docId, tagId },
            },
            create: {
                docId,
                tagId,
            },
            update: {}, // No-op if already exists
        });
    }

    /**
     * Remove a tag from a document
     */
    async unassignFromDoc(docId: string, tagId: string): Promise<void> {
        await this.prisma.docTagAssignment.deleteMany({
            where: { docId, tagId },
        });
    }

    /**
     * Get all tags for a specific document
     */
    async findTagsByDocId(docId: string, orgId: string): Promise<DocTag[]> {
        const assignments = await this.prisma.docTagAssignment.findMany({
            where: {
                docId,
                tag: { orgId },
            },
            include: {
                tag: true,
            },
        });

        return assignments.map((a) => a.tag);
    }

    /**
     * Get all document IDs that have a specific tag
     */
    async findDocIdsByTagId(tagId: string, orgId: string): Promise<string[]> {
        const assignments = await this.prisma.docTagAssignment.findMany({
            where: {
                tagId,
                tag: { orgId },
            },
            select: { docId: true },
        });

        return assignments.map((a) => a.docId);
    }

    /**
     * Bulk assign tags to a document
     */
    async bulkAssignToDoc(docId: string, tagIds: string[]): Promise<void> {
        // Use transaction for atomicity
        await this.prisma.$transaction(
            tagIds.map((tagId) =>
                this.prisma.docTagAssignment.upsert({
                    where: { docId_tagId: { docId, tagId } },
                    create: { docId, tagId },
                    update: {},
                })
            )
        );
    }

    /**
     * Replace all tags on a document with new set
     */
    async setDocTags(docId: string, tagIds: string[]): Promise<void> {
        await this.prisma.$transaction([
            // Remove all existing assignments
            this.prisma.docTagAssignment.deleteMany({
                where: { docId },
            }),
            // Add new assignments
            ...tagIds.map((tagId) =>
                this.prisma.docTagAssignment.create({
                    data: { docId, tagId },
                })
            ),
        ]);
    }
}
