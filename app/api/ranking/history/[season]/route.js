// file: app/api/ranking/history/[season]/route.js
import db, { getSeasonDisplayLabel } from '@/lib/db.js';
import { getTitleFromRating } from '@/lib/title';

async function queryRows(sql, params = []) {
  const res = await db.query(sql, params);
  return Array.isArray(res) ? res : res.rows;
}

export async function GET(_request, context) {
  const params = await context.params; // ★ Next.js：params は Promise
  const seasonCodeRaw = params?.season;
  const seasonCode = Number(seasonCodeRaw);

  if (!Number.isFinite(seasonCode)) {
    return new Response(JSON.stringify({ error: 'season パラメータが不正です' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const seasonLabel = getSeasonDisplayLabel(seasonCode);
    const year = Math.floor(seasonCode / 100);
    const month = seasonCode % 100;
    const ymLabel = `${year}年${month}月`;

    // ============================
    // レート戦ランキング（TOP10）
    // ============================
    const rateRows = await queryRows(
      `
        SELECT
          u.id            AS user_id,
          u.username      AS username,
          u.display_name  AS display_name,
          COALESCE(
            SUM(
              CASE
                WHEN m.user1_id = u.id THEN COALESCE(m.rating_change1, 0)
                WHEN m.user2_id = u.id THEN COALESCE(m.rating_change2, 0)
                ELSE 0
              END
            ),
            0
          ) AS total_change,
          SUM(CASE WHEN m.winner_id = u.id THEN 1 ELSE 0 END) AS wins,
          SUM(
            CASE
              WHEN m.winner_id IS NOT NULL
               AND m.winner_id != 0
               AND m.winner_id != u.id
              THEN 1
              ELSE 0
            END
          ) AS losses
        FROM matches m
        JOIN users u ON (u.id = m.user1_id OR u.id = m.user2_id)
        WHERE m.mode = 'rate'
          AND m.season = $1
        GROUP BY u.id, u.username, u.display_name
        HAVING COUNT(*) > 0
        ORDER BY
          (1500 + COALESCE(
            SUM(
              CASE
                WHEN m.user1_id = u.id THEN COALESCE(m.rating_change1, 0)
                WHEN m.user2_id = u.id THEN COALESCE(m.rating_change2, 0)
                ELSE 0
              END
            ),
            0
          )) DESC,
          wins DESC,
          u.id ASC
        LIMIT 10
      `,
      [seasonCode]
    );

    const rateRanking = (rateRows || []).map((row, index) => {
      const finalRating = 1500 + (row.total_change ?? 0);
      return {
        rank: index + 1,
        user_id: row.user_id,
        username: row.username,
        display_name: row.display_name,
        rating: Math.round(finalRating),
        wins: row.wins ?? 0,
        losses: row.losses ?? 0,
        rankName: getTitleFromRating(finalRating),
      };
    });

    // ==========================================
    // チャレンジモード シーズンランキング（TOP10）
    // ★ challenge_season_records は使わず challenge_runs から直接集計
    // ==========================================
    const challengeRows = await queryRows(
      `
        SELECT
          u.id           AS user_id,
          u.username     AS username,
          u.display_name AS display_name,
          u.rating       AS rating,
          MAX(c.correct_count) AS best_correct,
          MIN(c.miss_count)    AS best_miss
        FROM challenge_runs c
        JOIN users u ON u.id = c.user_id
        WHERE c.season = $1
        GROUP BY u.id, u.username, u.display_name, u.rating
        ORDER BY best_correct DESC, best_miss ASC, u.id ASC
        LIMIT 10
      `,
      [seasonCode]
    );

    const challengeRanking = (challengeRows || []).map((row, index) => {
      const name =
        (row.display_name && row.display_name.trim().length > 0
          ? row.display_name
          : row.username) || '名無し';

      return {
        rank: index + 1,
        user_id: row.user_id,
        name,
        username: row.username,
        display_name: row.display_name,
        rating: row.rating,
        best_correct: row.best_correct,
        best_miss: row.best_miss,
      };
    });

    return new Response(
      JSON.stringify({
        seasonCode,
        seasonLabel,
        ymLabel,
        rateRanking,
        challengeRanking,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }
    );
  } catch (e) {
    console.error('[api/ranking/history/[season]] error', e);
    return new Response(JSON.stringify({ error: 'failed to load season ranking' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}
