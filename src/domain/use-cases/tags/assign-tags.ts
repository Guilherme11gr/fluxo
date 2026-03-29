/**
 * Assign Tags Use Case
 * Assigns one or more tags to a document (idempotent)
 */
import { DocTagRepository } from '@/infra/adapters/prisma/doc-tag.repository';
import { ProjectDocRepository } from '@/infra/adapters/prisma/project-doc.repository';
import { NotFoundError } from '@/shared/errors';

export interface AssignTagsInput {
    docId: string;
    tagIds: string[];
    orgId: string;
}

export interface AssignTagsDeps {
    docTagRepository: DocTagRepository;
    projectDocRepository: ProjectDocRepository;
}

export async function assignTags(
    input: AssignTagsInput,
    { docTagRepository, projectDocRepository }: AssignTagsDeps
) {
    const { docId, tagIds, orgId } = input;

    // Verify document exists and belongs to org
    const doc = await projectDocRepository.findById(docId, orgId);
    if (!doc) {
        throw new NotFoundError('Document not found');
    }

    // Assign each tag (idempotent via upsert in repository)
    await docTagRepository.bulkAssignToDoc(docId, tagIds);

    // Return updated tags for the document
    return docTagRepository.findTagsByDocId(docId, orgId);
}
