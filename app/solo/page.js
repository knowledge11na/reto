// file: app/solo/page.js
'use client';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';

export default function SoloMenuPage() {
  const [meteorBest, setMeteorBest] = useState(0);
  const [sniperBest, setSniperBest] = useState(0);
  const [dungeonBest, setDungeonBest] = useState(null);

  const [me, setMe] = useState(null);

  // ★ ソロ称号APIを何度も叩かないためのフラグ
  const soloTitlesSentRef = useRef(false);

  // ユーザー情報取得（userId をソロ称号APIに送るため）
  useEffect(() => {
    const fetchMe = async () => {
      try {
        const res = await fetch('/api/me', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.user) {
          setMe(data.user);
        } else {
          setMe(null);
        }
      } catch {
        setMe(null);
      }
    };
    fetchMe();
  }, []);

  // 各ゲームの自己ベスト（ブラウザ保存）を読み込む
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      // 隕石
      const rawMeteor = window.localStorage.getItem('meteor_best_score');
      const m = rawMeteor ? Number(rawMeteor) : 0;
      if (!Number.isNaN(m) && m > 0) {
        setMeteorBest(m);
      }

      // スナイパー
      const rawSniper = window.localStorage.getItem('sniper_best_score');
      const s = rawSniper ? Number(rawSniper) : 0;
      if (!Number.isNaN(s) && s > 0) {
        setSniperBest(s);
      }

      // ダンジョン（まだ実装中なら保存されてなくてもOK）
      const rawDungeon = window.localStorage.getItem('dungeon_best_score');
      const d = rawDungeon ? Number(rawDungeon) : 0;
      if (!Number.isNaN(d) && d > 0) {
        setDungeonBest(d);
      } else {
        setDungeonBest(null);
      }
    } catch {
      // 無視
    }
  }, []);

  // 自己ベストから「隕石クラッシュ」「正答スナイパー」系の称号を付与
  useEffect(() => {
    if (!me || !me.id) return;

    // まだ一度も送っていない & どちらかは遊んでる
    if (soloTitlesSentRef.current) return;
    if (meteorBest <= 0 && sniperBest <= 0) return;

    soloTitlesSentRef.current = true;

    fetch('/api/solo/titles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'solo_menu',
        userId: me.id,
        meteorBest,
        sniperBest,
      }),
    }).catch(() => {
      // エラー時は特に何もしない（称号付与が遅れるだけ）
    });
  }, [me, meteorBest, sniperBest]);

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-extrabold">
            🎮 ソロゲームメニュー
          </h1>
          <Link
            href="/"
            className="text-xs font-bold text-sky-700 underline hover:text-sky-500"
          >
            ホームに戻る
          </Link>
        </header>

        <p className="text-[12px] text-sky-900 mb-4">
          1人でプレイできるモードです。レートは変動しません。
        </p>

        <div className="space-y-3">
          {/* 隕石クラッシュ */}
          <div className="rounded-2xl border border-indigo-400 bg-indigo-50 px-3 py-3 shadow-sm">
            <Link href="/solo/meteor" className="block">
              <p className="text-sm font-bold text-indigo-900">
                隕石クラッシュ（記述式）
              </p>
              <p className="text-[11px] text-indigo-950 leading-tight mt-1">
                記述式だけ出題。問題が隕石のように降ってくる。制限時間内にどれだけ破壊できるか。
              </p>
            </Link>
            <div className="mt-2 flex items-center justify-between text-[11px] text-indigo-900">
              <span>
                自己ベスト:{' '}
                <span className="font-semibold">{meteorBest}</span>
                個
              </span>
              <Link
                href="/solo/meteor/rules"
                className="underline text-indigo-700 hover:text-indigo-500"
              >
                ルールを見る
              </Link>
            </div>
          </div>

          {/* 正答スナイパー */}
          <div className="rounded-2xl border border-emerald-400 bg-emerald-50 px-3 py-3 shadow-sm">
            <Link
              href="/solo/sniper"
              className="block hover:bg-emerald-100 rounded-2xl -mx-3 -my-3 px-3 py-3 transition"
            >
              <p className="text-sm font-bold text-emerald-900">
                正答スナイパー（単一選択）
              </p>
              <p className="text-[11px] text-emerald-950 leading-tight mt-1">
                単一選択の正解だけを素早く撃ち抜く3分間のタイムアタック。
                正解で時間回復・ミスで時間減少。
              </p>
            </Link>
            <div className="mt-2 flex items-center justify-between text-[11px] text-emerald-900">
              <span>
                自己ベスト:{' '}
                <span className="font-semibold">{sniperBest}</span>
                問
              </span>
              <Link
                href="/solo/sniper/rules"
                className="underline text-emerald-700 hover:text-emerald-500"
              >
                ルールを見る
              </Link>
            </div>
          </div>

          {/* ダンジョン（複数回答） */}
          <div className="rounded-2xl border border-amber-400 bg-amber-50 px-3 py-3 shadow-sm">
            <Link
              href="/solo/dungeon"
              className="block hover:bg-amber-100 rounded-2xl -mx-3 -my-3 px-3 py-3 transition"
            >
              <p className="text-sm font-bold text-amber-900">
                ダンジョン（複数回答）
              </p>
              <p className="text-[11px] text-amber-950 leading-tight mt-1">
                モンスターの弱点だけを選んで魔法攻撃する複数選択専用モード。
                5回ミスで終了。
              </p>
            </Link>

            <div className="mt-2 flex items-center justify-between text-[11px] text-amber-900">
              <span>
                自己ベスト:{' '}
                <span className="font-semibold">
                  {dungeonBest != null ? dungeonBest : '--'}
                </span>
                問
              </span>
              <Link
                href="/solo/dungeon/rules"
                className="underline text-amber-700 hover:text-amber-500"
              >
                ルールを見る
              </Link>
            </div>
          </div>

          {/* ボス討伐 */}
          <Link
            href="/solo/boss"
            className="block rounded-2xl border border-rose-400 bg-rose-50 px-3 py-3 shadow-sm hover:bg-rose-100"
          >
            <p className="text-sm font-bold text-rose-900">
              ボス討伐（全形式）
            </p>
            <p className="text-[11px] text-rose-950 leading-tight mt-1">
              単一・複数・並び替え・記述、全形式の問題を使ってボスのHPを削るモード。
            </p>
          </Link>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="inline-block px-4 py-2 rounded-full border border-sky-500 bg-white text-xs font-bold text-sky-700 hover:bg-sky-50"
          >
            ホームへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
