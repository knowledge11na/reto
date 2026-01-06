// file: app/api/ranking/history/list/route.js
import db, { getSeasonDisplayLabel } from '@/lib/db.js';

async function queryRows(sql, params = []) {
  const res = await db.query(sql, params);
  return Array.isArray(res) ? res : res.rows;
}

export async function GET() {
  try {
    const rows = await queryRows(
      `
        SELECT DISTINCT season
        FROM rate_season_rankings
        ORDER BY season DESC
      `,
      []
    );

    return new Response(
      JSON.stringify({
        seasons: (rows || []).map((r) => ({
          season: r.season,
          label: getSeasonDisplayLabel(r.season),
        })),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }
    );
  } catch (e) {
    console.error('[api/ranking/history/list] error', e);
    return new Response(
      JSON.stringify({ error: 'failed to load rate seasons' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }
    );
  }
}
