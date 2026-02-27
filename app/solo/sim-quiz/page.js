// file: app/solo/sim-quiz/page.js
'use client';

import Link from 'next/link';

const STAGES = [
  {
    id: 1,
    title: 'ステージ1：9x9 入門',
    desc: '下中央4x4に配置→奥にボス＋前に雑魚4体',
    size: '9x9',
  },
];

export default function SimQuizStageSelectPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-5">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold">シミュレーション</h1>
            <p className="text-[11px] text-slate-300 mt-1">
              ステージを選んで開始（形状プレビューも可）
            </p>
          </div>
          <Link
            href="/solo"
            className="text-[11px] font-bold text-sky-200 underline underline-offset-2 hover:text-sky-100"
          >
            ソロへ戻る
          </Link>
        </header>

        <section className="space-y-2">
          {STAGES.map((s) => (
            <div
              key={s.id}
              className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 shadow-lg"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-extrabold">{s.title}</div>
                  <div className="text-[11px] text-slate-300 mt-1">{s.desc}</div>
                  <div className="text-[10px] text-amber-200 mt-1">盤面：{s.size}</div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <Link
                    href={`/solo/sim-quiz/stages/${s.id}`}
                    className="px-3 py-2 rounded-xl border border-slate-500 bg-slate-900 text-[11px] font-bold hover:bg-slate-800 text-center"
                  >
                    形状を見る
                  </Link>
                  <Link
                    href={`/solo/sim-quiz/play?stage=${s.id}`}
                    className="px-3 py-2 rounded-xl bg-sky-600 text-[11px] font-extrabold hover:bg-sky-500 text-center"
                  >
                    プレイ
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </section>

        <div className="mt-4 text-[10px] text-slate-400">
          ※ ステージ追加は STAGES 配列に増やしていくだけでOK
        </div>
      </div>
    </main>
  );
}