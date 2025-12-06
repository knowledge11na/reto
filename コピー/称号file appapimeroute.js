// file: app/api/me/route.js
import { NextResponse } from 'next/server';
import db, { getCurrentSeason, getSeasonDisplayLabel } from '@/lib/db.js';
import { cookies } from 'next/headers';

// レートから称号を決める（マイページ表示用）
function ratingToTitle(rating) {
  if (rating >= 2400) return '四皇クラス';
  if (rating >= 2200) return '大将クラス';
  if (rating >= 2000) return '七武海クラス';
  if (rating >= 1800) return '新世界の猛者';
  if (rating >= 1600) return '偉大なる航路の海賊';
  if (rating >= 1400) return '東の海の実力者';
  return '海の卵';
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const username = cookieStore.get('nb_username')?.value || null;

    console.log('[api/me] nb_username =', username);

    if (!username) {
      return NextResponse.json(
        {
          user: null,
          season: null,
          season_code: null,
          challenge: null,
          challengeSeasonBest: null,
          challengeAllTimeBest: null,
          ratingTitle: null,
          equippedTitle: null,
        },
        { status: 200 }
      );
    }

    const row = await db.get(
      `
        SELECT
          id,
          username,
          display_name,
          rating,
          internal_rating,
          matches_played,
          wins,
          losses,
          current_streak,
          best_streak,
          berries,
          twitter_url,
          login_id,
          banned,
          equipped_title   -- ★ 自由称号カラム
        FROM users
        WHERE username = $1
      `,
      [username]
    );

    console.log('[api/me] user row =', row);

    if (!row || (row.banned ?? 0) !== 0) {
      try {
        cookieStore.set('nb_username', '', { path: '/', maxAge: 0 });
      } catch (e) {
        console.warn('[api/me] failed to clear cookie', e);
      }

      return NextResponse.json(
        {
          user: null,
          season: null,
          season_code: null,
          challenge: null,
          challengeSeasonBest: null,
          challengeAllTimeBest: null,
          ratingTitle: null,
          equippedTitle: null,
        },
        { status: 200 }
      );
    }

    // ===== twitter URL 正規化 =====
    const { banned, twitter_url, login_id, equipped_title, ...rest } = row;

    let twitterIdSource = twitter_url || login_id || '';
    let effectiveTwitterUrl = '';

    if (twitterIdSource) {
      let id = twitterIdSource.replace(/^@/, '').trim();
      id = id.replace(/^https?:\/\/(twitter\.com|x\.com)\//, '').trim();

      if (id) {
        effectiveTwitterUrl = `https://x.com/${id}`;
      }
    }

    const user = {
      ...rest,
      login_id,
      twitter_url: effectiveTwitterUrl,
      // equipped_title はトップレベルでも受け取れるようにしておく
      equipped_title,
    };

    // ===== シーズン関連 =====
    const seasonCode = getCurrentSeason();
    const seasonLabel = getSeasonDisplayLabel(seasonCode);

    // ===== チャレンジモード記録（challenge_runs から集計） =====
    let seasonBest = null;
    let allTimeBest = null;

    try {
      const seasonRow = await db.get(
        `
          SELECT MAX(correct_count) AS best_correct
          FROM challenge_runs
          WHERE user_id = $1 AND season = $2
        `,
        [user.id, seasonCode]
      );

      const allTimeRow = await db.get(
        `
          SELECT MAX(correct_count) AS best_correct
          FROM challenge_runs
          WHERE user_id = $1
        `,
        [user.id]
      );

      if (seasonRow && seasonRow.best_correct != null) {
        seasonBest = {
          season: seasonCode,
          best_correct: Number(seasonRow.best_correct) || 0,
        };
      }

      if (allTimeRow && allTimeRow.best_correct != null) {
        allTimeBest = {
          season: null,
          best_correct: Number(allTimeRow.best_correct) || 0,
        };
      }
    } catch (e) {
      console.error('[api/me] challenge stats error', e);
    }

    // ★ レート称号（基準は固定）
    const rating = user.rating ?? 1500;
    const ratingTitle = ratingToTitle(rating);

    // ★ 自由称号（装備中のもの）
    const equippedTitle = equipped_title ?? null;

    return NextResponse.json(
      {
        user,
        season: seasonLabel,
        season_code: seasonCode,
        challenge: {
          seasonBest,
          allTimeBest,
        },
        challengeSeasonBest: seasonBest,
        challengeAllTimeBest: allTimeBest,
        // 追加分
        ratingTitle,
        equippedTitle,
      },
      { status: 200 }
    );
  } catch (e) {
    console.error('[api/me] error', e);
    return NextResponse.json(
      {
        user: null,
        season: null,
        season_code: null,
        challenge: null,
        challengeSeasonBest: null,
        challengeAllTimeBest: null,
        ratingTitle: null,
        equippedTitle: null,
      },
      { status: 500 }
    );
  }
}
