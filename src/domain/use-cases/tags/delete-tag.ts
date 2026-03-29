/**
 * Delete Tag Use Case
 * Deletes a tag and all its assignments (cascade)
 */
import { DocTagRepository } from '@/infra/adapters/prisma/doc-tag.repository';
import { NotFoundError } from '@/shared/errors';

export interface DeleteTagDeps {
    docTagRepository: DocTagRepository;
}

export async function deleteTag(
    tagId: string,
    orgId: string,
    { docTagRepository }: DeleteTagDeps
) {
    const tag = await docTagRepository.findById(tagId, orgId);
    if (!tag) {
        throw new NotFoundError('Tag not found');
    }

    await docTagRepository.delete(tagId, orgId);
}
