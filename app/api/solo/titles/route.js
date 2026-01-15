// file: app/api/solo/titles/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

// ユーザーに称号を付与する共通関数
async function grantTitleByCode(userId, code) {
  if (!userId || !code) return false;

  // titles.id を取得
  const row = await db.get('SELECT id FROM titles WHERE code = $1', [code]);
  if (!row) return false;

  const titleId = row.id;

  // 既に持っていないか確認
  const owned = await db.get(
    'SELECT id FROM user_titles WHERE user_id = $1 AND title_id = $2',
    [userId, titleId]
  );
  if (owned) return false;

  // 付与
  await db.run(
    `
      INSERT INTO user_titles (user_id, title_id, acquired_at, equipped)
      VALUES ($1, $2, NOW(), FALSE)
    `,
    [userId, titleId]
  );

  return true;
}

// 複数候補コードのうち、存在するものだけ付与
async function grantMany(userId, codes, granted) {
  for (const code of codes) {
    if (!code) continue;
    if (await grantTitleByCode(userId, code)) {
      granted.push(code);
    }
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    console.log('[solo/titles] body =', body);

    const { type } = body;

    const rawUserId = body.userId ?? body.user_id;
    const userId = rawUserId ? Number(rawUserId) : NaN;

    if (!rawUserId || Number.isNaN(userId)) {
      return NextResponse.json(
        { ok: false, message: 'userId が不正です' },
        { status: 400 }
      );
    }

    const granted = [];

    // ① ソロメニュー（隕石クラッシュ / 正答スナイパー / ダンジョン / 爆弾解除 / 風船割り / 仕分け）
    if (type === 'solo_menu') {
      const meteorBest = Number(body.meteorBest ?? 0);
      const sniperBest = Number(body.sniperBest ?? 0);

      // ★ 追加：ダンジョン（複数選択）
      const dungeonBest = Number(body.dungeonBest ?? 0);

      // ★ 追加：爆弾解除（並び替え）
      const bombBest = Number(body.bombBest ?? 0);

      // ★ 追加：仕分けゲーム（出身）
      const bornBest = Number(body.bornBest ?? 0);

      // ★ 追加：風船割り（5モード）
      // body.balloonBests が {food,height,age,bounty,other} の想定
      const balloon = body.balloonBests || {};
      const balloonFood = Number(balloon.food ?? body.balloonFoodBest ?? 0);
      const balloonHeight = Number(balloon.height ?? body.balloonHeightBest ?? 0);
      const balloonAge = Number(balloon.age ?? body.balloonAgeBest ?? 0);
      const balloonBounty = Number(balloon.bounty ?? body.balloonBountyBest ?? 0);
      const balloonOther = Number(balloon.other ?? body.balloonOtherBest ?? 0);

      // ★ 隕石クラッシュ
      if (meteorBest >= 50) {
        await grantMany(userId, ['solo_meteor_50'], granted);
      }
      if (meteorBest >= 75) {
        await grantMany(userId, ['solo_meteor_75'], granted);
      }
      if (meteorBest >= 100) {
        // 旧コード meteor_100 も一応見ておく
        await grantMany(userId, ['solo_meteor_100', 'meteor_100'], granted);
      }

      // ★ 正答スナイパー
      if (sniperBest >= 50) {
        await grantMany(userId, ['solo_sniper_50', 'sniper_50'], granted);
      }
      if (sniperBest >= 75) {
        await grantMany(userId, ['solo_sniper_75', 'sniper_75'], granted);
      }
      if (sniperBest >= 100) {
        await grantMany(userId, ['solo_sniper_100', 'sniper_100'], granted);
      }

      // =========================
      // ★ 37〜39：ダンジョン自己ベスト
      // =========================
      if (dungeonBest >= 20) {
        await grantMany(userId, ['solo_dungeon_20'], granted);
      }
      if (dungeonBest >= 40) {
        await grantMany(userId, ['solo_dungeon_40'], granted);
      }
      if (dungeonBest >= 60) {
        await grantMany(userId, ['solo_dungeon_60'], granted);
      }

      // =========================
      // ★ 40〜42：爆弾解除自己ベスト
      // =========================
      if (bombBest >= 20) {
        await grantMany(userId, ['solo_bomb_20'], granted);
      }
      if (bombBest >= 40) {
        await grantMany(userId, ['solo_bomb_40'], granted);
      }
      if (bombBest >= 60) {
        await grantMany(userId, ['solo_bomb_60'], granted);
      }

      // =========================
      // ★ 43〜47：風船割り（モード別50）
      // =========================
      if (balloonFood >= 50) {
        await grantMany(userId, ['solo_balloon_food_50'], granted);
      }
      if (balloonHeight >= 50) {
        await grantMany(userId, ['solo_balloon_height_50'], granted);
      }
      if (balloonAge >= 50) {
        await grantMany(userId, ['solo_balloon_age_50'], granted);
      }
      if (balloonBounty >= 50) {
        await grantMany(userId, ['solo_balloon_bounty_50'], granted);
      }
      if (balloonOther >= 50) {
        await grantMany(userId, ['solo_balloon_other_50'], granted);
      }

      // =========================
      // ★ 48：仕分けゲーム（出身）自己ベスト50
      // =========================
      if (bornBest >= 50) {
        await grantMany(userId, ['solo_sort_50'], granted);
      }
    }

    // ② ボス討伐（タイムアタック系）
    else if (type === 'boss') {
      const difficulty = String(body.difficulty ?? '');
      const result = String(body.result ?? '');
      const clearMs = Number(body.value ?? body.clearMs ?? 0);
      const noTeam = !!body.noTeam;

      if (result === 'win' && clearMs > 0 && difficulty) {
        const clearSec = clearMs / 1000;

        if (difficulty === 'easy' && clearSec <= 60) {
          await grantMany(userId, ['boss_easy_60'], granted);
        }
        if (difficulty === 'normal' && clearSec <= 100) {
          await grantMany(userId, ['boss_normal_100'], granted);
        }
        if (difficulty === 'hard' && clearSec <= 150) {
          await grantMany(userId, ['boss_hard_150'], granted);
        }
        if (difficulty === 'veryhard' && clearSec <= 180) {
          await grantMany(userId, ['boss_vh_180'], granted);
        }

        // ★ エクストラ 300 秒以内
        if (difficulty === 'extra' && clearSec <= 300) {
          await grantMany(userId, ['boss_extra_300'], granted);
        }
      }

      // ★ エクストラをマイチーム全部空でクリア（タイム条件なし）
      if (result === 'win' && difficulty === 'extra' && noTeam) {
        await grantMany(userId, ['boss_extra_noteam'], granted);
      }
    }

    // ③ マイページから：所持キャラ数 & チャレンジモード
    else if (type === 'mypage') {
      const ownedCharacters = Number(body.ownedCharacters ?? body.charsOwned ?? 0);

      // チャレンジの「シーズン最高」と「歴代最高」どちらも見て最大値を使う
      const seasonBest = Number(body.challengeSeasonBest ?? 0);
      const allTimeBest = Number(
        body.challengeAllTimeBest ??
          body.challengeBest ??
          body.allTimeBest ??
          0
      );
      const challengeBest = Math.max(seasonBest, allTimeBest);

      // ★ キャラ所持数（図鑑：100 / 300 / 500）
      if (ownedCharacters >= 100) {
        await grantMany(userId, ['zukan_100', 'chars_100'], granted);
      }
      if (ownedCharacters >= 300) {
        await grantMany(userId, ['zukan_300', 'chars_300'], granted);
      }
      if (ownedCharacters >= 500) {
        await grantMany(userId, ['zukan_500', 'chars_500'], granted);
      }

      // ★ チャレンジ（歴代最高 10 / 30 / 50）
      if (challengeBest >= 10) {
        await grantMany(userId, ['challenge_10', 'challenge_all_10'], granted);
      }
      if (challengeBest >= 30) {
        await grantMany(userId, ['challenge_30', 'challenge_all_30'], granted);
      }
      if (challengeBest >= 50) {
        await grantMany(userId, ['challenge_50', 'challenge_all_50'], granted);
      }
    }

    return NextResponse.json({ ok: true, granted });
  } catch (e) {
    console.error('[api/solo/titles] error', e);
    return NextResponse.json(
      { ok: false, message: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
