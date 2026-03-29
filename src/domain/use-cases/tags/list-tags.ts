/**
 * List Tags Use Case
 * Lists all tags for a project with document counts
 */
import { DocTagRepository } from '@/infra/adapters/prisma/doc-tag.repository';

export interface ListTagsDeps {
    docTagRepository: DocTagRepository;
}

export async function listTags(
    projectId: string,
    orgId: string,
    { docTagRepository }: ListTagsDeps
) {
    return docTagRepository.findByProjectId(projectId, orgId);
}
