// file: app/solo/born/rules/page.js
'use client';

import Link from 'next/link';

export default function BornRulesPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-100 via-orange-50 to-amber-100 text-slate-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-extrabold">📦 仕分けゲーム（出身）ルール</h1>
          <Link href="/solo" className="text-xs font-bold text-orange-700 underline hover:text-orange-500">
            ソロメニューへ
          </Link>
        </header>

        <div className="space-y-4 text-sm leading-relaxed">
          <section className="bg-white/95 rounded-2xl border border-orange-200 shadow-sm p-4">
            <h2 className="font-bold text-orange-900 mb-2">🎮 ゲーム概要</h2>
            <p>
              画面内を動き回るキャラクターを掴んで、
              <span className="font-semibold">正しい出身の仕切り</span>
              （東・西・南・北・偉）へ仕分けるゲームです。
            </p>
            <p className="mt-1">
              正しく仕分けるごとにスコアが1増え、ゲームが進むほど難しくなります。
            </p>
          </section>

          <section className="bg-white/95 rounded-2xl border border-orange-200 shadow-sm p-4">
            <h2 className="font-bold text-orange-900 mb-2">🧲 操作方法</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>キャラを <span className="font-semibold">タップ or クリックして掴む</span></li>
              <li>そのままドラッグして仕切りの中へ移動</li>
              <li>指・マウスを離すと仕分け判定</li>
            </ul>
            
          </section>

          <section className="bg-white/95 rounded-2xl border border-orange-200 shadow-sm p-4">
            <h2 className="font-bold text-orange-900 mb-2">🚪 扉と出現ルール</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>最初は <span className="font-semibold">上の扉</span> からのみ出現</li>
              <li>スコアが上がると <span className="font-semibold">左右・下の扉</span> が解放</li>
              <li>扉が増えるほど <span className="font-semibold">同時に出てくる数が増加</span></li>
            </ul>
                     </section>

          <section className="bg-white/95 rounded-2xl border border-orange-200 shadow-sm p-4">
            <h2 className="font-bold text-orange-900 mb-2">💣 ゲームオーバー条件</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>
                キャラを <span className="font-semibold">間違った仕切り</span> に入れた
              </li>
              <li>
                制限時間内に仕分けられず <span className="font-semibold">爆破</span> した
              </li>
            </ul>
            <p className="mt-2">
              爆破直前のキャラは <span className="font-semibold">点滅</span> で警告されます。
            </p>
          </section>

          <section className="bg-white/95 rounded-2xl border border-orange-200 shadow-sm p-4">
            <h2 className="font-bold text-orange-900 mb-2">🏆 スコアについて</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>正しく仕分けた人数 = スコア</li>
              <li>自己ベストは <span className="font-semibold">ブラウザに保存</span></li>
                         </ul>
          </section>
        </div>

        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/solo/born"
            className="px-4 py-2 rounded-full bg-orange-500 text-white text-sm font-bold hover:bg-orange-600"
          >
            プレイする
          </Link>
          <Link
            href="/solo"
            className="px-4 py-2 rounded-full border border-orange-400 bg-white text-sm font-bold text-orange-700 hover:bg-orange-50"
          >
            ソロメニューへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
