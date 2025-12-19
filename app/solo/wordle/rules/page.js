// file: app/solo/wordle/rules/page.js
'use client';

import Link from 'next/link';

export default function WordleRulesPage() {
  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-extrabold">📘 ワードル：ルール</h1>
          <Link href="/solo/wordle" className="text-xs font-bold text-sky-700 underline hover:text-sky-500">
            ゲームへ戻る
          </Link>
        </header>

        <div className="rounded-2xl border border-slate-400 bg-white px-4 py-4 shadow-sm space-y-3">
          <p className="text-[12px] font-bold text-slate-900">
            ひらがな単語を当てるパズルです。文字数は <span className="font-extrabold">5〜9文字</span> から選べます。
          </p>

          <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-3">
            <p className="text-[12px] font-extrabold text-slate-900 mb-1">判定の色</p>
            <ul className="text-[11px] text-slate-900 leading-relaxed space-y-1">
              <li>🟩 緑：文字も位置も正解</li>
              <li>🟧 橙：文字は含まれるが位置が違う</li>
              <li>⬜ 灰：その文字は含まれない</li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-3">
            <p className="text-[12px] font-extrabold text-slate-900 mb-1">試行回数</p>
            <p className="text-[11px] text-slate-900 leading-relaxed">
              1ゲーム <span className="font-extrabold">8回</span> まで入力できます。
            </p>
          </div>

          <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-3">
            <p className="text-[12px] font-extrabold text-slate-900 mb-1">操作</p>
            <ul className="text-[11px] text-slate-900 leading-relaxed space-y-1">
              <li>キーボードの文字を押すと入力できます。</li>
              <li>直接入力（スマホのキーボード入力）もOK。</li>
              <li>「諦める」で答えを表示して終了できます。</li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-3">
            <p className="text-[12px] font-extrabold text-slate-900 mb-1">用語</p>
            <ul className="text-[11px] text-slate-900 leading-relaxed space-y-1">
              <li>存在する技名、キャラ名を入力可能。</li>
              <li>5文字は島の名前や武器名など用語が全て収録。</li>
              <li>キャラ名には下の名前のみのものや異名込みも収録。</li>
            </ul>
          </div>
        </div>


        <div className="mt-6 text-center">
          <Link
            href="/solo/wordle"
            className="inline-block px-4 py-2 rounded-full border border-sky-500 bg-white text-xs font-bold text-sky-700 hover:bg-sky-50"
          >
            ゲームへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
