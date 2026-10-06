/**
 * Aggregates logs into one row per (project_id, fingerprint) with the latest
 * level/message/metadata and first/last seen. `where` is a trusted SQL
 * fragment over `logs`; its `?` placeholders are bound by the caller.
 */
export function issueAggregateSql(where: string): string {
  return `
    SELECT fingerprint, project_id, level, message, count, first_seen,
           last_seen, latest_metadata
    FROM (
      SELECT
        fingerprint,
        project_id,
        level,
        message,
        metadata AS latest_metadata,
        COUNT(*) OVER w AS count,
        MIN(timestamp) OVER w AS first_seen,
        MAX(timestamp) OVER w AS last_seen,
        ROW_NUMBER() OVER (w ORDER BY timestamp DESC, id DESC) AS rn
      FROM logs
      WHERE ${where}
      WINDOW w AS (PARTITION BY project_id, fingerprint)
    ) ranked
    WHERE rn = 1
  `;
}
