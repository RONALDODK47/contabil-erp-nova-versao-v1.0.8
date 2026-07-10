/**
 * Mescla documentos eye_vision_manager (legado + sharded) — portado do Gestão Contábil.
 */

export function mergeManagerCloudDocuments(docs) {
  /** @type {Map<string, { company_slug: string, company_name: string, data: Record<string, unknown[]>, legacyData: Record<string, unknown[]> | null, chunkBuckets: Map<string, unknown[][]>, directShards: Map<string, unknown[]>, hasShards: boolean }>} */
  const groups = new Map();

  for (const raw of docs) {
    const row = typeof raw?.data === 'function' ? raw.data() : raw;
    if (!row || typeof row !== 'object') continue;

    const slug = String(row.company_slug || '').trim();
    if (!slug) continue;

    let group = groups.get(slug);
    if (!group) {
      group = {
        company_slug: slug,
        company_name: String(row.company_name || '').trim(),
        data: {},
        legacyData: null,
        chunkBuckets: new Map(),
        directShards: new Map(),
        hasShards: false,
      };
      groups.set(slug, group);
    }

    if (!group.company_name && row.company_name) {
      group.company_name = String(row.company_name).trim();
    }

    if (row.data && typeof row.data === 'object' && !row.suffix) {
      group.legacyData = row.data;
      continue;
    }

    if (!row.suffix || !Array.isArray(row.rows)) continue;

    group.hasShards = true;

    if (row.chunk_count != null && row.chunk_index != null) {
      const suffix = String(row.suffix);
      const bucket = group.chunkBuckets.get(suffix) || [];
      bucket[Number(row.chunk_index)] = row.rows;
      group.chunkBuckets.set(suffix, bucket);
    } else {
      group.directShards.set(String(row.suffix), row.rows);
    }
  }

  const result = [];
  for (const group of groups.values()) {
    if (group.hasShards) {
      for (const [suffix, rows] of group.directShards) {
        group.data[suffix] = rows;
      }
      for (const [suffix, parts] of group.chunkBuckets) {
        group.data[suffix] = parts.flatMap((part) => (Array.isArray(part) ? part : []));
      }
    } else if (group.legacyData) {
      group.data = group.legacyData;
    }

    result.push({
      company_slug: group.company_slug,
      company_name: group.company_name,
      data: group.data,
    });
  }
  return result;
}
