/**
 * Create Tag Use Case
 * Creates a new tag for a project with uniqueness validation
 */
import { DocTagRepository } from '@/infra/adapters/prisma/doc-tag.repository';
import { ConflictError } from '@/shared/errors';

export interface CreateTagInput {
    name: string;
    projectId: string;
    orgId: string;
}

export interface CreateTagDeps {
    docTagRepository: DocTagRepository;
}

export async function createTag(
    input: CreateTagInput,
    { docTagRepository }: CreateTagDeps
) {
    const { name, projectId, orgId } = input;
    const trimmedName = name.trim();

    if (!trimmedName) {
        throw new Error('Tag name is required');
    }

    // Check for existing tag with same name in project
    const existingTag = await docTagRepository.findByName(trimmedName, projectId, orgId);
    if (existingTag) {
        throw new ConflictError(`Tag '${trimmedName}' already exists in this project`);
    }

    return docTagRepository.create({
        name: trimmedName,
        projectId,
        orgId,
    });
}
