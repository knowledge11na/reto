// file: app/solo/balloon/page.js
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const items = [
  { key: 'food', title: '風船割り：好物', desc: '' },
  { key: 'height', title: '風船割り：身長', desc: '' },
  { key: 'age', title: '風船割り：年齢', desc: '' },
  { key: 'bounty', title: '風船割り：懸賞金', desc: '' },
  { key: 'other', title: '風船割り：趣味その他', desc: '' },
];

export default function BalloonMenuPage() {
  const [bests, setBests] = useState({});

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const next = {};
    for (const it of items) {
      try {
        const raw = window.localStorage.getItem(`balloon_best_${it.key}`);
        const n = raw ? Number(raw) : 0;
        next[it.key] = Number.isFinite(n) && n > 0 ? n : 0;
      } catch {
        next[it.key] = 0;
      }
    }
    setBests(next);
  }, []);

  return (
    <main className="min-h-screen bg-sky-200 text-slate-900 p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold">バルーン</h1>
          <Link className="underline font-bold text-slate-800" href="/">
            ホームへ戻る
          </Link>
        </header>

        <div className="grid gap-3">
          {items.map((it) => {
            const best = bests[it.key] ?? 0;
            return (
              <Link
                key={it.key}
                href={`/solo/balloon/play?mode=${encodeURIComponent(it.key)}`}
                className="block rounded-2xl border border-sky-400 bg-white/90 p-4 shadow-sm hover:bg-white"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="font-extrabold">{it.title}</div>
                  <div className="shrink-0 text-xs font-extrabold text-sky-700">
                    自己ベスト：{best}
                  </div>
                </div>

                <div className="text-sm text-slate-700 mt-1">{it.desc}</div>
              </Link>
            );
          })}
        </div>

        {/* ★ルール差し替え */}
        <div className="rounded-2xl border border-sky-300 bg-white/85 p-4 text-slate-800 space-y-3">
          <div className="text-sm font-extrabold">風船割り</div>

          <div className="space-y-1">
            <div className="text-xs font-extrabold">基本ルール</div>
            <ul className="list-disc pl-5 text-xs">
              <li>10分間でどれだけ風船を割れるか</li>
              <li>上空に風船が飛んで行ってしまうと -20秒</li>
            </ul>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-extrabold">詳細ルール</div>
            <ul className="list-disc pl-5 text-xs space-y-1">
              <li>
                好物：<b>、</b>や<b>・</b>は不要。好物の順序も問わない。例：ウソップの答え「秋島のサンマ・旬の魚」→「秋島のサンマ旬の魚」「旬の魚秋島のサンマ」どちらでも正解。（）内の文字は不要
              </li>
              <li>
                ただし<b>○○と○○</b>や<b>○○＆○○</b>のようなものは順不同だが、「と」や「＆」は入れなくてはいけない
              </li>
              <li>
                年齢・身長：<b>数字のみ</b>で回答。身長は全て<b>cm</b>
              </li>
              <li>
                懸賞金：文字は不要で<b>万以下は打たない</b>。例：ロジャー「55億6480万」→入力「556480」
              </li>
              <li>
                その他：船の名前に関しては<b>中黒の有無は正確に</b>（半角/全角はOK）。趣味などの複数ある場合の処理は好物同様
              </li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
