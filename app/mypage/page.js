// file: app/mypage/page.js
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getTitleFromRating } from '@/lib/title';

export default function MyPage() {
  const [user, setUser] = useState(null);
  const [season, setSeason] = useState('');
  const [loading, setLoading] = useState(true);

  // Twitter
  const [twitterUrl, setTwitterUrl] = useState('');

  // 表示名まわり
  const [displayName, setDisplayName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [nameChangeUsed, setNameChangeUsed] = useState(0);
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState('');

  // ログアウト中フラグ
  const [loggingOut, setLoggingOut] = useState(false);

  // キャラ図鑑サマリ
  const [charSummary, setCharSummary] = useState(null);

  // ★ チャレンジ成績
  const [challengeSeasonBest, setChallengeSeasonBest] = useState(0);
  const [challengeAllTimeBest, setChallengeAllTimeBest] = useState(0);

  // ============================
  // 初期ロード (/api/me /api/user/characters)
  // ============================
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/me');
        const d = await res.json();
        const u = d.user ?? null;

        setUser(u);
        setSeason(d.season ?? '');
        setTwitterUrl(u?.twitter_url || '');

        // ★ チャレンジ成績を取り出す（両方の形式に対応）
        const seasonBestObj =
          d.challengeSeasonBest || d.challenge?.seasonBest || null;
        const allTimeBestObj =
          d.challengeAllTimeBest || d.challenge?.allTimeBest || null;

        setChallengeSeasonBest(seasonBestObj?.best_correct ?? 0);
        setChallengeAllTimeBest(allTimeBestObj?.best_correct ?? 0);

        if (u) {
          // 表示名
          try {
            const r2 = await fetch('/api/me/display-name');
            if (r2.ok) {
              const d2 = await r2.json();
              const dn = d2.displayName || u.username;
              setDisplayName(dn);
              setNameInput(dn);
              setNameChangeUsed(d2.nameChangeUsed ?? 0);
            } else {
              setDisplayName(u.username);
              setNameInput(u.username);
            }
          } catch (e) {
            console.error(e);
            setDisplayName(u.username);
            setNameInput(u.username);
          }

          // キャラ図鑑サマリ
          try {
            const r3 = await fetch(`/api/user/characters?user_id=${u.id}`);
            if (r3.ok) {
              const d3 = await r3.json();
              const list = d3.characters || [];
              setCharSummary({ uniqueOwned: list.length });
            }
          } catch (e) {
            console.warn('characters fetch failed', e);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  // ============================
  // ★ マイページから称号チェック用 API を呼ぶ
  //    ・チャレンジ最高記録
  //    ・所持キャラ数
  // ============================
  useEffect(() => {
    if (!user) return;

    const ownedCount =
      (charSummary?.uniqueOwned ?? charSummary?.ownedCount ?? 0) || 0;
    const seasonBest = challengeSeasonBest || 0;
    const allTimeBest = challengeAllTimeBest || 0;

    // どれも 0 なら送っても意味ないのでスキップ
    if (!ownedCount && !seasonBest && !allTimeBest) return;

    fetch('/api/solo/titles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'mypage',
        userId: user.id,
        ownedCharacters: ownedCount, // 所持キャラ数
        challengeSeasonBest: seasonBest, // シーズン最高
        challengeAllTimeBest: allTimeBest, // 歴代最高
      }),
    }).catch(() => {
      // エラー時は特に何もしない（称号付与が遅れるだけ）
    });
  }, [user, charSummary, challengeSeasonBest, challengeAllTimeBest]);

  // ============================
  // ログアウト
  // ============================
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) {
        console.error('logout failed', await res.text().catch(() => ''));
      }
      window.location.href = '/';
    } catch (e) {
      console.error(e);
      alert('ログアウトに失敗しました。時間をおいて再度お試しください。');
      setLoggingOut(false);
    }
  };

  // ============================
  // 名前変更
  // ============================
  const handleNameSave = async (e) => {
    e?.preventDefault?.();
    if (savingName || nameChangeUsed >= 1) return;

    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameMessage('名前を入力してください。');
      return;
    }

    setSavingName(true);
    setNameMessage('');

    try {
      const res = await fetch('/api/me/display-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: trimmed }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setNameMessage(
          data.message ||
            '名前の変更に失敗しました。時間をおいて再度お試しください。'
        );
        return;
      }

      setDisplayName(data.displayName || trimmed);
      setNameInput(data.displayName || trimmed);
      setNameChangeUsed(data.nameChangeUsed ?? 1);
      setNameMessage('名前を変更しました。（2回目以降は変更できません）');
    } catch (e) {
      console.error(e);
      setNameMessage('名前の変更中にエラーが発生しました。');
    } finally {
      setSavingName(false);
    }
  };

  // ============================
  // ローディング & 未ログイン
  // ============================
  if (loading) {
    return (
      <div className="min-h-screen bg-sky-50 flex items-center justify-center">
        <p className="text-sky-700">読み込み中です...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-sky-50 flex flex-col items-center justify-center">
        <p className="mb-4">マイページを見るにはログインが必要です。</p>
        <Link
          href="/login"
          className="px-4 py-2 rounded-full bg-sky-500 text-white font-bold"
        >
          ログインへ
        </Link>
      </div>
    );
  }

  // ============================
  // 表示用値
  // ============================
  const berriesForView = user.berries ?? 0;
  const canDrawGacha = berriesForView >= 500;

  const wins = user.wins ?? 0;
  const losses = user.losses ?? 0;
  const totalMatches =
    user.matches_played ?? (wins + losses > 0 ? wins + losses : 0);
  const winRate =
    wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

  const nameEditable = nameChangeUsed < 1;

  const rating = user.rating ?? 1500;
  const displayTitle = getTitleFromRating(rating);

  const handleGotoGacha = (e) => {
    if (!canDrawGacha) {
      e.preventDefault();
      alert('ガチャには 500 ベリー必要です。クイズや投稿でベリーを集めてください！');
    }
  };

  const ownedUnique =
    charSummary?.uniqueOwned ?? charSummary?.ownedCount ?? null;

  // チャレンジ表示用
  const seasonBestCorrect = challengeSeasonBest;
  const allTimeBestCorrect = challengeAllTimeBest;

  // ============================
  // JSX
  // ============================
  return (
    <div className="min-h-screen bg-sky-50 flex flex-col items-center text-sky-900">
      {/* ヘッダー */}
      <header className="w-full max-w-md px-4 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src="/logo-skull.png"
            alt="ナレバト"
            className="w-20 h-20 object-contain"
          />
          <h1 className="text-2xl font-extrabold tracking-widest">ナレバト</h1>
        </div>
        <Link
          href="/"
          className="border-2 border-sky-600 px-3 py-1 rounded-full text-sm font-bold text-sky-700 bg-white shadow-sm"
        >
          ホームへ
        </Link>
      </header>

      <main className="w-full max-w-md px-4 pb-10 mt-4 space-y-4">
        {/* プロフィール */}
        <section className="bg-sky-100 border-2 border-sky-500 rounded-3xl p-4 shadow-sm">
          <h2 className="text-lg font-extrabold mb-3">プロフィール</h2>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-14 h-14 rounded-full bg-sky-300 flex items-center justify-center text-2xl">
              🏴‍☠️
            </div>
            <div className="space-y-1">
              <p className="text-lg font-bold">
                {displayName || user.username}
              </p>
              <p className="text-xs flex items-center gap-2">
                <span>称号：</span>
                <span className="inline-block px-2 py-0.5 rounded-full bg-orange-100 border border-orange-300 text-[11px] font-bold text-orange-700">
                  {displayTitle}
                </span>
                <Link
                  href="/titles"
                  className="text-[10px] text-sky-700 underline ml-1"
                >
                  称号一覧
                </Link>
              </p>

              <p className="text-xs text-sky-700">
                表示レート：<span className="font-bold">{user.rating}</span>
              </p>
              <p className="text-xs text-sky-700">
                現在のシーズン：{season || '-'}
              </p>
            </div>
          </div>

          <p className="text-sm text-sky-800">
            所持ベリー：{berriesForView} ベリー
          </p>

          {/* 名前変更フォーム（1回だけ） */}
          <div className="mt-4 text-xs">
            <p className="font-bold mb-1">名前の変更（1度まで）</p>
            {nameEditable ? (
              <form onSubmit={handleNameSave} className="space-y-2">
                <input
                  className="w-full px-2 py-1 rounded border border-sky-400 bg-white text-sky-900 text-sm"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  maxLength={20}
                  placeholder="例）ナレバト太郎"
                />
                <button
                  type="submit"
                  disabled={savingName}
                  className="px-3 py-1 rounded-full bg-sky-500 text-white font-bold text-xs disabled:opacity-60"
                >
                  {savingName ? '保存中…' : 'この名前に変更する'}
                </button>
              </form>
            ) : (
              <p className="text-[11px] text-sky-700">
                すでに名前を変更済みのため、これ以上の変更はできません。
              </p>
            )}
            {nameMessage && (
              <p className="mt-1 text-[11px] text-rose-600">{nameMessage}</p>
            )}
          </div>

          {/* Twitterリンク表示 */}
          <div className="mt-4">
            <p className="text-sm font-bold">Twitterリンク</p>
            {twitterUrl ? (
              <a
                href={twitterUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-sky-700 underline break-all"
              >
                {twitterUrl}
              </a>
            ) : (
              <p className="text-sm text-sky-800">Twitter未連携</p>
            )}
            <p className="mt-1 text-[11px] text-sky-700">
              ※ 新規ログイン時のTwitter連携から自動で設定されます。
            </p>
          </div>
        </section>

        {/* レート戦・通算戦績 */}
        <section className="bg-sky-100 border-2 border-sky-500 rounded-3xl p-4 shadow-sm">
          <h2 className="text-lg font-extrabold mb-2">レート戦・通算戦績</h2>
          <div className="text-sm space-y-1">
            <p>
              対戦数：{totalMatches} 戦 ／ 勝率：{winRate}%
            </p>
            <p>
              勝ち：{wins} 戦 ／ 負け：{losses} 戦
            </p>
            <p>最高連勝：{user.best_streak ?? 0} 連勝</p>
          </div>
          <p className="mt-2 text-[11px] text-sky-700">
            ※ 各プレイヤーごとの戦績・シーズン別の戦績は今後実装予定です。
          </p>
        </section>

        {/* チャレンジモード成績 */}
        <section className="bg-sky-100 border-2 border-sky-500 rounded-3xl p-4 shadow-sm">
          <h2 className="text-lg font-extrabold mb-2">チャレンジモード成績</h2>
          <div className="text-sm space-y-1">
            <p>
              シーズン最高：{seasonBestCorrect} 問正解
            </p>
            <p>
              歴代最高：{allTimeBestCorrect} 問正解
            </p>
          </div>
          <p className="mt-2 text-[11px] text-sky-700">
            ※ チャレンジモードでプレイすると、この記録が自動で更新されます。
          </p>
        </section>

        {/* ガチャ */}
        <section className="bg-sky-100 border-2 border-sky-500 rounded-3xl p-4 shadow-sm">
          <h2 className="text-lg font-extrabold mb-2">ガチャ</h2>
          <p className="text-sm mb-2">
            投稿1問につき100ベリー獲得 ／ ガチャ1回：500ベリー
          </p>

          {canDrawGacha ? (
            <Link
              href="/gacha"
              onClick={handleGotoGacha}
              className="w-full block text-center py-3 rounded-full bg-orange-400 text-white font-bold shadow active:bg-orange-500"
            >
              ガチャを引く（500ベリー）
            </Link>
          ) : (
            <button
              className="w-full py-3 rounded-full bg-gray-300 text-gray-500 font-bold cursor-not-allowed"
              disabled
            >
              ベリーが足りません
            </button>
          )}

          <p className="mt-2 text-[11px] text-sky-700">
            ※ ガチャ画面では宝箱演出付きでキャラカードが排出されます。
          </p>
        </section>

        {/* キャラ図鑑 */}
        <section className="bg-sky-100 border-2 border-sky-500 rounded-3xl p-4 shadow-sm">
          <h2 className="text-lg font-extrabold mb-2">キャラ図鑑</h2>
          <p className="text-sm mb-3">
            所持キャラ数：
            {ownedUnique != null ? `${ownedUnique} 体` : '取得中 / 未実装'}
          </p>
          <Link
            href="/characters"
            className="block w-full text-center py-2 rounded-full bg-white border border-sky-500 text-sky-700 font-bold"
          >
            キャラ図鑑ページへ ＞
          </Link>
        </section>

        {/* 投稿した問題 */}
        <section className="bg-sky-100 border-2 border-sky-500 rounded-3xl p-4 shadow-sm">
          <h2 className="text-lg font-extrabold mb-2">投稿した問題</h2>
          <div className="space-y-2">
            <Link
              href="/my-questions"
              className="block w-full text-center py-2 rounded-full bg-white border border-sky-500 text-sky-700 font-bold"
            >
              投稿一覧へ ＞
            </Link>
            <Link
              href="/submit"
              className="block w-full text-center py-2 rounded-full bg-sky-500 text-white font-bold"
            >
              新しく問題を投稿する
            </Link>
          </div>
        </section>

        {/* その他（履歴・復習・ログアウト） */}
        <section className="bg-sky-100 border-2 border-sky-500 rounded-3xl p-3 shadow-sm">
          <h2 className="text-lg font-extrabold mb-2">その他</h2>
          <div className="flex flex-col gap-2">
            <Link
              href="/mistakes"
              className="w-full text-center py-2 rounded-full bg-white border border-sky-500 text-sky-700 text-sm font-bold"
            >
              間違えた問題を復習する
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full text-center py-2 rounded-full bg-gray-300 text-gray-700 text-sm font-bold disabled:opacity-60"
            >
              {loggingOut ? 'ログアウト中…' : 'ログアウト'}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
