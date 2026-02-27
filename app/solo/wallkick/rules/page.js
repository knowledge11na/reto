// file: app/solo/wallkick/rules/page.js
'use client';

import Link from 'next/link';

export default function WallKickRulesPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-extrabold">🧗 ウォールエスケープ：ルール</h1>
          <Link
            href="/"
            className="text-xs font-bold text-sky-700 underline hover:text-sky-500"
          >
            ホームへ戻る
          </Link>
        </header>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 space-y-3">
          <div>
            <p className="text-sm font-extrabold">目的</p>
            <p className="text-[12px] text-slate-700 mt-1">
              壁キックで生き延びてスコアを伸ばす。上から障害物が落ちてくる。
            </p>
          </div>

          <div>
            <p className="text-sm font-extrabold">操作</p>
            <ul className="list-disc list-inside text-[12px] text-slate-700 mt-1 space-y-1">
              <li>画面タップ（または Space）で反対の壁へキック</li>
              <li>壁に張り付いている間は少しずつ下がる</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-extrabold">ゲームオーバー条件</p>
            <ul className="list-disc list-inside text-[12px] text-slate-700 mt-1 space-y-1">
              <li>障害物に当たる</li>
              <li>下まで落ちきる</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-extrabold">挑戦条件</p>
            <p className="text-[12px] text-slate-700 mt-1">
              このゲームは <span className="font-bold">毎回</span> クイズ1問に正解しないと挑戦できない。
              （クイズ方式はボスバトルと同様）
            </p>
          </div>

          <div className="pt-2 flex gap-2">
            <Link
              href="/solo/wallkick"
              className="flex-1 py-2 rounded-full bg-purple-600 text-white text-sm font-extrabold hover:bg-purple-500 text-center"
            >
              プレイへ戻る
            </Link>
            <Link
              href="/solo"
              className="flex-1 py-2 rounded-full border border-slate-300 bg-white text-slate-800 text-sm font-bold hover:bg-slate-50 text-center"
            >
              ソロメニュー
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}