import {
  getQualitySummary,
  getConversationShapes,
  getQualityByVersion,
  type QualitySummary,
  type ConversationShape,
  type VersionQuality,
} from './queries';

// Counts only, for the public dashboard. getConversationShapes reads up to
// 20,000 rows, so the public page reuses one result for a few minutes rather
// than letting every page view rerun it.
export type PublicQuality = {
  quality: QualitySummary;
  shapes: ConversationShape;
  versions: VersionQuality[];
};

const TTL_MS = 5 * 60 * 1000;
let cached: { at: number; value: Promise<PublicQuality> } | null = null;

export function getPublicQuality(): Promise<PublicQuality> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = Promise.all([getQualitySummary(30), getConversationShapes(30), getQualityByVersion(90)]).then(
    ([quality, shapes, versions]) => ({ quality, shapes, versions }),
  );
  // A failed query is not cached, so the next view retries.
  value.catch(() => {
    if (cached?.value === value) cached = null;
  });
  cached = { at: Date.now(), value };
  return value;
}
