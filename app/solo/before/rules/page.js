'use client';

import Link from 'next/link';

export default function BeforeRulesPage() {
  return (
    <main className="min-h-screen bg-sky-50 text-slate-900">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-xl sm:text-2xl font-extrabold">
            時系列（ルール）
          </h1>
          <div className="flex gap-2 text-xs">
            <Link
              href="/solo/before"
              className="px-3 py-1 rounded-full bg-amber-400 text-amber-950 font-semibold hover:bg-amber-500"
            >
              時系列へ戻る
            </Link>
            <Link
              href="/"
              className="px-3 py-1 rounded-full border border-sky-400 bg-white text-sky-700 font-semibold hover:bg-sky-50"
            >
              ホームへ戻る
            </Link>
          </div>
        </header>

        <section className="bg-white rounded-2xl shadow-sm border border-sky-100 p-4 sm:p-5 space-y-4 text-sm leading-relaxed">
          <h2 className="font-bold text-sky-800 mb-1">ゲーム概要</h2>
          <p>
            マップ上に配置された出来事（A〜E）を、
            <strong>時系列順</strong>に取っていくゲーム。
            開始時に「古い順」または「新しい順」を選択し、
            スタートまでの<strong>10秒間</strong>で、それぞれが何年前の出来事かを考える。
          </p>

          <h2 className="font-bold text-sky-800 mt-3 mb-1">操作方法</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>プレイヤー（白丸）を操作して移動する</li>
            <li>画面をスワイプして行きたい方向へ向きを変更</li>
            <li>穴が開いた壁はワープゾーンとなり、反対側の壁へ移動できる</li>
          </ul>

          <h2 className="font-bold text-sky-800 mt-3 mb-1">ゲームオーバー条件</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>青状態ではない敵に接触する</li>
            <li>順番通りではない選択肢に触れてしまう</li>
          </ul>

          <h2 className="font-bold text-sky-800 mt-3 mb-1">敵の青状態</h2>
          <p>
            正しい選択肢を取得すると、一定時間すべての敵が
            <strong>青状態</strong>になり、プレイヤーから逃げるように動く。
            青状態の敵に触れると倒すことができ、一定時間マップから消える。
          </p>

          <h2 className="font-bold text-sky-800 mt-3 mb-1">敵の特徴</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>赤</strong>：プレイヤーを最短ルートで追ってくる。ワープ不可</li>
            <li><strong>ピンク</strong>：プレイヤーの進行方向に先回りする。ワープ不可</li>
            <li><strong>緑</strong>：一定時間ごとに縄張りを持ち、その周辺を徘徊する</li>
            <li><strong>黄色</strong>：ランダムに移動する</li>
          </ul>

          <h2 className="font-bold text-sky-800 mt-3 mb-1">フルーツ</h2>
          <p>
            マップ上に一定時間フルーツが出現する。
            取得すると一瞬の間、<strong>すべての選択肢の答え</strong>が表示される。
          </p>

          <h2 className="font-bold text-sky-800 mt-3 mb-1">WAVEについて</h2>
          <p>
            A〜Eの5個すべての選択肢を取り終えると、
            数秒間停止した後に新しい選択肢が配置され、次のWAVEが始まる。
          </p>

          <p className="text-xs text-slate-500 mt-3">
            ※本モードはソロ専用モードのため、レートやランキングへの影響はありません。
          </p>
        </section>
      </div>
    </main>
  );
}
