/**
 * Get Documents By Tag Use Case
 * Returns all documents that have a specific tag assigned
 */
import { DocTagRepository } from '@/infra/adapters/prisma/doc-tag.repository';
import { ProjectDocRepository } from '@/infra/adapters/prisma/project-doc.repository';
import { NotFoundError } from '@/shared/errors';

export interface GetDocsByTagDeps {
    docTagRepository: DocTagRepository;
    projectDocRepository: ProjectDocRepository;
}

export async function getDocsByTag(
    tagId: string,
    projectId: string,
    orgId: string,
    { docTagRepository, projectDocRepository }: GetDocsByTagDeps
) {
    // Verify tag exists and belongs to org
    const tag = await docTagRepository.findById(tagId, orgId);
    if (!tag) {
        throw new NotFoundError('Tag not found');
    }

    // Get document IDs that have this tag
    const docIds = await docTagRepository.findDocIdsByTagId(tagId, orgId);

    // Return docs if any found
    if (docIds.length === 0) {
        return [];
    }

    // Fetch the actual documents
    const docs = await projectDocRepository.findByProjectId(projectId, orgId);

    // Filter to only those with this tag
    return docs.filter((doc) => docIds.includes(doc.id));
}
