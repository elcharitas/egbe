import { env } from 'cloudflare:workers';

// Shared current-visibility rule for reading and requesting help with material.
export async function visibleMaterialRow(id: string, viewer: string) {
  const stored = await env.DB.prepare(
    `SELECT m.id, m.circle_id, m.owner, m.title, m.source_url,
            m.attribution, m.text, m.created_at, m.removed_at
     FROM study_materials m
     JOIN study_circles c ON c.id = m.circle_id
     WHERE m.id = ? AND m.removed_at IS NULL
       AND (c.visibility = 'public' OR EXISTS (
         SELECT 1 FROM circle_members
         WHERE circle_id = c.id AND owner = ?))`,
  )
    .bind(id, viewer)
    .first();
  if (!stored) throw new Error('Material not found or removed.');
  return stored;
}
