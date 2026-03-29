/**
 * Unassign Tag Use Case
 * Removes a specific tag from a document
 */
import { DocTagRepository } from '@/infra/adapters/prisma/doc-tag.repository';
import { ProjectDocRepository } from '@/infra/adapters/prisma/project-doc.repository';
import { NotFoundError } from '@/shared/errors';

export interface UnassignTagInput {
    docId: string;
    tagId: string;
    orgId: string;
}

export interface UnassignTagDeps {
    docTagRepository: DocTagRepository;
    projectDocRepository: ProjectDocRepository;
}

export async function unassignTag(
    input: UnassignTagInput,
    { docTagRepository, projectDocRepository }: UnassignTagDeps
) {
    const { docId, tagId, orgId } = input;

    // Verify document exists and belongs to org
    const doc = await projectDocRepository.findById(docId, orgId);
    if (!doc) {
        throw new NotFoundError('Document not found');
    }

    // Remove the assignment
    await docTagRepository.unassignFromDoc(docId, tagId);

    // Return updated tags for the document
    return docTagRepository.findTagsByDocId(docId, orgId);
}
