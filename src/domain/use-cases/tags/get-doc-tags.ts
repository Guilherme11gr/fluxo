/**
 * Get Tags For Document Use Case
 * Returns all tags assigned to a specific document
 */
import { DocTagRepository } from '@/infra/adapters/prisma/doc-tag.repository';
import { ProjectDocRepository } from '@/infra/adapters/prisma/project-doc.repository';
import { NotFoundError } from '@/shared/errors';

export interface GetDocTagsDeps {
    docTagRepository: DocTagRepository;
    projectDocRepository: ProjectDocRepository;
}

export async function getDocTags(
    docId: string,
    orgId: string,
    { docTagRepository, projectDocRepository }: GetDocTagsDeps
) {
    // Verify document exists and belongs to org
    const doc = await projectDocRepository.findById(docId, orgId);
    if (!doc) {
        throw new NotFoundError('Document not found');
    }

    return docTagRepository.findTagsByDocId(docId, orgId);
}
