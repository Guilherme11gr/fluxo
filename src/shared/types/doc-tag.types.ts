/**
 * Doc Tag Types
 * Shared type definitions for documentation tagging system
 */

export interface DocTag {
    id: string;
    name: string;
    projectId: string;
    orgId: string;
    createdAt: Date | string;
}

export interface DocTagWithCount extends DocTag {
    _count: {
        assignments: number;
    };
}

export interface CreateDocTagInput {
    name: string;
    projectId: string;
}

export interface DocTagAssignment {
    id: string;
    docId: string;
    tagId: string;
    createdAt: Date | string;
}

export interface AssignTagsInput {
    docId: string;
    tagIds: string[];
}

export interface DocWithTags {
    id: string;
    title: string;
    content: string;
    projectId: string;
    orgId: string;
    createdAt: Date | string;
    updatedAt: Date | string;
    tags: DocTag[];
}
