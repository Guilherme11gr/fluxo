import type { Feature, FeatureStatus, TaskFocus } from '@/shared/types';
import type { FeatureRepository } from '@/infra/adapters/prisma';
import { NotFoundError } from '@/shared/errors';

export interface UpdateFeatureInput {
  title?: string;
  description?: string | null;
  status?: FeatureStatus;
  focus?: TaskFocus | null;
}

export interface UpdateFeatureDeps {
  featureRepository: FeatureRepository;
}

export async function updateFeature(
  id: string,
  orgId: string,
  input: UpdateFeatureInput,
  deps: UpdateFeatureDeps
): Promise<Feature> {
  const { featureRepository } = deps;

  const existing = await featureRepository.findById(id, orgId);
  if (!existing) {
    throw new NotFoundError('Feature', id);
  }

  return await featureRepository.update(id, orgId, input);
}
