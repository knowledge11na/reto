// file: app/solo/boss/rules/page.js
'use client';

import Link from 'next/link';

export default function SoloBossRulesPage() {
  return (
    <main className="min-h-screen bg-sky-50 text-slate-900">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-xl sm:text-2xl font-extrabold">
            🐉 ボスバトル ルール
          </h1>
          <Link
            href="/solo/boss"
            className="text-xs font-bold text-sky-700 underline hover:text-sky-500"
          >
            ボスバトルに戻る
          </Link>
        </header>

        <section className="bg-white border border-sky-100 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4 text-[13px] sm:text-sm leading-relaxed">
          <div>
            <h2 className="font-bold text-sky-800 mb-1">
              基本ルール
            </h2>
            <ul className="list-disc list-inside space-y-1.5 text-slate-800">
              <li>問題に正解すると「自分の攻撃」でボスのHPを削ります。</li>
              <li>不正解 または 時間切れになると「ボスの攻撃」を受け、自分のHPが減ります。</li>
              <li>ボスのHPを0にすると勝利、自分のHPが0になると敗北です。</li>
              <li>
                問題形式は「単一選択・複数選択・並び替え・記述」の全形式が出題されます。
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-bold text-sky-800 mb-1">
              HP の仕様
            </h2>
            <ul className="list-disc list-inside space-y-1.5 text-slate-800">
              <li>ボスHPは難易度ごとに固定です。</li>
              <li>
                自分のHPは
                <span className="font-semibold">
                  「1000 ＋ マイチームの 現在のレア度 合計 × 100」
                </span>
                で計算されます。
              </li>
              <li>
                マイチームを設定していない場合でも挑戦できます（その場合は
                HP=1000）。
              </li>
            </ul>
            <div className="mt-2 text-[12px] text-slate-700">
              <p className="font-semibold mb-1">ボスHP（目安）</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>イージー: 2000</li>
                <li>ノーマル: 4000</li>
                <li>ハード: 7000</li>
                <li>ベリーハード: 1000</li>
                <li>エクストラ: 30000</li>
              </ul>
            </div>
          </div>

          <div>
            <h2 className="font-bold text-sky-800 mb-1">
              攻撃力のルール
            </h2>
            <ul className="list-disc list-inside space-y-1.5 text-slate-800">
              <li>
                自分の攻撃力は
                <span className="font-semibold">
                  基本 50 ＋（連続正解数1問につき）× 50
                </span>
                です。
              </li>
              <li>
                連続正解数が
                <span className="font-semibold">
                  2, 3, 4...
                </span>{' '}
                と増えるごとに攻撃力が50ずつ上がります。
              </li>
              <li>
                不正解になると連続正解数はリセットされ、攻撃力も基本値に戻ります。
              </li>
              <li>
                ボスの攻撃力は難易度ごとに「基本攻撃力」があり、
                <span className="font-semibold">
                  基本攻撃力 ＋ 不正解数 × ボスごとの上がり値
                </span>
                になります。
              </li>
              <li>
                正解してもボスの攻撃力は継続です。
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-bold text-sky-800 mb-1">
              制限時間
            </h2>
            <p className="text-slate-800 mb-1.5">
              問題ごとに制限時間があり、時間切れになると自動的に「不正解」となります。
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-800">
              <li>単一選択: 30秒</li>
              <li>複数選択・並び替え: 40秒</li>
              <li>記述（〜15文字）: 60秒</li>
              <li>記述（16文字〜）: 80秒</li>
            </ul>
          </div>

          <div>
            <h2 className="font-bold text-sky-800 mb-1">
              自己ベストについて
            </h2>
            <ul className="list-disc list-inside space-y-1.5 text-slate-800">
              <li>
                ボスを倒した場合のみ、その挑戦の
                <span className="font-semibold">
                  討伐タイム
                </span>
                が記録候補になります。
              </li>
              <li>
                同じ難易度で、より短いタイムで討伐すると自己ベストが更新されます。
              </li>
              <li>
                自己ベストには
                <span className="font-semibold">
                  「その挑戦時のマイチーム」
                </span>
                も一緒に保存され、ボスバトルメニューから確認できます。
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-bold text-sky-800 mb-1">
              問題の振り返り・不備報告
            </h2>
            <p className="text-slate-800">
              バトル終了後は、その挑戦で出題された問題を一覧で振り返ることができ、
              不備があった問題はそのまま報告することができます。
            </p>
          </div>
        </section>

        <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
          <Link
            href="/solo/boss"
            className="px-4 py-2 rounded-full bg-sky-500 text-white font-bold hover:bg-sky-400"
          >
            ボスバトルメニューに戻る
          </Link>
          <Link
            href="/solo"
            className="px-4 py-2 rounded-full border border-sky-400 bg-white text-sky-700 font-bold hover:bg-sky-50"
          >
            ソロメニューへ
          </Link>
          <Link
            href="/"
            className="px-4 py-2 rounded-full border border-slate-400 bg-white text-slate-700 font-bold hover:bg-slate-50"
          >
            ホームへ
          </Link>
        </div>
      </div>
    </main>
  );
}
