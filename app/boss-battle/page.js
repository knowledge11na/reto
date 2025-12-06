// file: app/boss-battle/page.js
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function BossBattlePage() {
  const [eventInfo, setEventInfo] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [me, setMe] = useState(null);
  const [loadingEvent, setLoadingEvent] = useState(true);

  // ログイン状態
  useEffect(() => {
    fetch('/api/me')
      .then((res) => res.json())
      .then((data) => setMe(data.user ?? null))
      .catch(() => setMe(null));
  }, []);

  // イベント情報＋ランキング取得
  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const userIdParam =
          me && (me.id || me.user_id || me.userId)
            ? `?userId=${me.id || me.user_id || me.userId}`
            : '';
        const res = await fetch(`/api/boss-battle/event${userIdParam}`);
        const data = await res.json();
        if (res.ok && data.event) {
          setEventInfo(data.event);
          setRanking(data.ranking || []);
        }
      } catch (e) {
        console.error('boss-battle event fetch error', e);
      } finally {
        setLoadingEvent(false);
      }
    };

    fetchEvent();
  }, [me]);

  const goalCorrect = eventInfo?.goalCorrect ?? 0;
  const totalCorrect = eventInfo?.totalCorrect ?? 0;
  const myCorrect = eventInfo?.myCorrect ?? 0;

  const totalProgress =
    goalCorrect > 0
      ? Math.min(100, Math.round((totalCorrect / goalCorrect) * 100))
      : 0;

  const myProgress =
    goalCorrect > 0
      ? Math.min(100, Math.round((myCorrect / goalCorrect) * 100))
      : 0;

  const remaining = Math.max(0, goalCorrect - totalCorrect);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      {/* ヘッダー */}
      <header className="w-full px-4 pt-4 flex items-center justify-between max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="px-3 py-1 rounded-full text-xs font-bold bg-slate-800 border border-slate-600 hover:bg-slate-700"
          >
            ⬅ ホームに戻る
          </Link>
        </div>
        <div className="text-right text-[11px] text-slate-300">
          期間限定イベント
          <br />
          <span className="text-sky-200 font-semibold">
            {eventInfo?.periodLabel ?? '---'}
          </span>
        </div>
      </header>

      {/* メイン */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 pb-8 mt-4 grid gap-4 lg:grid-cols-[2fr,1.3fr]">
        {/* 左側：ボス＆自分・全体の進捗 */}
        <section className="bg-slate-900/80 border border-slate-700 rounded-3xl p-4 md:p-5 shadow-lg flex flex-col gap-4">
          {/* ボス画像＋タイトル */}
          <div className="grid grid-cols-[minmax(0,1.2fr),minmax(0,1.8fr)] gap-3 items-center">
            {/* ボス画像枠（少し小さめ） */}
            <div className="relative w-full max-w-[200px] mx-auto aspect-[3/4] rounded-2xl overflow-hidden bg-slate-950 border border-slate-700 flex items-center justify-center">
              {/* public/boss-battle/boss-east-blue.png に画像を置く */}
              <img
                src="/boss-battle/boss-east-blue.png"
                alt="ボス"
                className="w-full h-full object-contain"
              />
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-slate-950/70 via-slate-950/20 to-transparent" />
            </div>

            {/* タイトル＆説明 */}
            <div className="space-y-2 text-sm">
              <div className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 text-[11px] font-bold">
                👹 期間限定ボスバトル
              </div>
              <h1 className="text-lg md:text-xl font-extrabold leading-snug text-amber-100">
                {eventInfo?.title ?? 'ボスバトル'}
              </h1>
              <p className="text-[12px] text-slate-300">
                対象タグ：
                <span className="font-semibold text-sky-200">
                  「{eventInfo?.tagLabel ?? '---'}」
                </span>
                の問題のみ出題。
                <br />
                期間中、みんなの正解数がそのままボスへのダメージになる
                協力イベントです。
              </p>

              <div className="mt-2 space-y-1 text-[12px]">
                <p className="text-slate-200">
                  🎯 目標：{' '}
                  <span className="font-bold text-amber-300">
                    総正解数 {goalCorrect.toLocaleString()} 問
                  </span>
                </p>
                <p className="text-slate-300">
                  成功報酬：参加者全員{' '}
                  <span className="font-bold text-emerald-300">
                    {eventInfo?.rewardAll?.toLocaleString() ?? '0'} ベリー
                  </span>
                </p>
                <p className="text-[11px] text-slate-400">
                  貢献ランキング：1位 +{eventInfo?.rewardRank1 ?? 0} / 2位 +
                  {eventInfo?.rewardRank2 ?? 0} / 3位 +
                  {eventInfo?.rewardRank3 ?? 0} ベリー
                </p>
              </div>
            </div>
          </div>

          {/* 進捗バー（全体） */}
          <div className="mt-1 space-y-2 text-sm">
            <div className="flex justify-between text-[12px]">
              <span className="font-semibold text-slate-200">
                全プレイヤー合計正解数
              </span>
              <span className="text-slate-100">
                {totalCorrect.toLocaleString()} / {goalCorrect.toLocaleString()} 問
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-400"
                style={{ width: `${totalProgress}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-300">
              <span>達成率：{totalProgress}%</span>
              <span>あと {remaining.toLocaleString()} 問で討伐！</span>
            </div>
          </div>

          {/* 自分の貢献 */}
          <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm">
            <div className="bg-slate-950/70 border border-sky-700 rounded-2xl p-3 space-y-2">
              <p className="text-[12px] font-semibold text-sky-100">
                あなたの累計正解数
              </p>
              <p className="text-2xl font-extrabold text-sky-300">
                {myCorrect.toLocaleString()} 問
              </p>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-sky-400"
                  style={{ width: `${myProgress}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                ※ イベント期間中、「{eventInfo?.tagLabel ?? '---'}」タグの
                ボスバトルでの正解のみカウントされます。
              </p>
            </div>

            <div className="bg-slate-950/70 border border-emerald-700 rounded-2xl p-3 space-y-2">
              <p className="text-[12px] font-semibold text-emerald-100">
                報酬のイメージ
              </p>
              <ul className="text-[12px] text-slate-200 space-y-1">
                <li>
                  ✔ ボス討伐成功：参加者全員{' '}
                  {eventInfo?.rewardAll ?? 0} ベリー
                </li>
                <li>🥇 貢献 1位：さらに +{eventInfo?.rewardRank1 ?? 0} ベリー</li>
                <li>🥈 貢献 2位：さらに +{eventInfo?.rewardRank2 ?? 0} ベリー</li>
                <li>🥉 貢献 3位：さらに +{eventInfo?.rewardRank3 ?? 0} ベリー</li>
              </ul>
              <p className="text-[11px] text-slate-400">
                報酬はイベント終了後に、自動でマイページのベリーに反映されます。
              </p>
            </div>
          </div>

          {/* 🔥 ボスバトルに挑戦ボタン */}
          <div className="mt-4">
            {me ? (
              <Link
                href="/boss-battle/play"
                className="block w-full text-center py-3 rounded-full bg-amber-400 text-slate-950 font-extrabold text-sm shadow hover:bg-amber-300"
              >
                👊 ボスバトルに挑戦する
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="block w-full text-center py-3 rounded-full bg-slate-700 text-slate-300 font-extrabold text-sm shadow cursor-not-allowed"
              >
                ログインするとボスバトルに挑戦できます
              </button>
            )}
            <p className="mt-1 text-[11px] text-slate-400 text-center">
              ボスバトルの問題は対象タグからのみ出題されます。
            </p>
          </div>
        </section>

        {/* 右側：貢献度ランキング */}
        <section className="bg-slate-900/80 border border-slate-700 rounded-3xl p-4 md:p-5 shadow-lg flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-slate-50">
              貢献度ランキング（期間中の正解数）
            </h2>
            {loadingEvent && (
              <span className="text-[10px] text-slate-400">
                読み込み中…
              </span>
            )}
          </div>

          <div className="mt-1 border border-slate-700 rounded-2xl overflow-hidden bg-slate-950/60">
            <table className="w-full text-[12px]">
              <thead className="bg-slate-900/90">
                <tr>
                  <th className="py-1.5 px-2 text-left w-10">順位</th>
                  <th className="py-1.5 px-2 text-left">プレイヤー</th>
                  <th className="py-1.5 px-2 text-right">正解数</th>
                </tr>
              </thead>
              <tbody>
                {ranking.length === 0 && !loadingEvent && (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-2 px-2 text-center text-slate-400"
                    >
                      まだランキングデータがありません。
                    </td>
                  </tr>
                )}

                {ranking.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-slate-800/80 even:bg-slate-900/40"
                  >
                    <td className="py-1.5 px-2">
                      {r.rank === 1 && (
                        <span className="text-amber-300">🥇 1位</span>
                      )}
                      {r.rank === 2 && (
                        <span className="text-slate-200">🥈 2位</span>
                      )}
                      {r.rank === 3 && (
                        <span className="text-orange-200">🥉 3位</span>
                      )}
                      {r.rank > 3 && <span>{r.rank}位</span>}
                    </td>
                    <td className="py-1.5 px-2 text-slate-100">{r.name}</td>
                    <td className="py-1.5 px-2 text-right text-sky-200">
                      {r.correct.toLocaleString()} 問
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
            ボスバトルでの正解ログから自動集計されたランキングです。
            イベント終了時点の順位に応じて、追加ベリーが配布されます。
          </p>
        </section>
      </main>
    </div>
  );
}
