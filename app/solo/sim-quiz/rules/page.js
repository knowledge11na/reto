// file: app/solo/sim-quiz/rules/page.js
'use client';

import Link from 'next/link';

export default function SimQuizRulesPage() {
  return (
    <main className="min-h-screen bg-sky-50 text-slate-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-extrabold">📘 シミュレーションクイズ ルール</h1>
          <Link href="/solo" className="text-xs font-bold text-sky-700 underline hover:text-sky-500">
            ソロに戻る
          </Link>
        </header>

        <div className="rounded-2xl border border-violet-400 bg-white p-4 shadow-sm">
          <ul className="text-[12px] text-slate-800 space-y-2">
            <li>・マス目マップでユニットを操作します。</li>
            <li>・攻撃時にクイズが出題されます。</li>
            <li>・正解で攻撃成功、不正解で反撃など。</li>
            <li>・詳細は今後調整予定。</li>
          </ul>

          <div className="mt-4 flex gap-2">
            <Link
              href="/solo/sim-quiz"
              className="inline-block px-3 py-2 rounded-xl border border-violet-500 bg-violet-50 text-xs font-bold text-violet-900 hover:bg-violet-100"
            >
              プレイへ戻る
            </Link>
            <Link
              href="/solo"
              className="inline-block px-3 py-2 rounded-xl border border-sky-500 bg-white text-xs font-bold text-sky-700 hover:bg-sky-50"
            >
              ソロへ
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}