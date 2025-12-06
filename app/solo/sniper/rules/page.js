// file: app/solo/sniper/rules/page.js
'use client';

import Link from 'next/link';

export default function SniperRulesPage() {
  return (
    <main className="min-h-screen bg-sky-50 text-slate-900">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold">
            正答スナイパー ルール
          </h1>
          <div className="flex gap-3">
            <Link
              href="/solo/sniper"
              className="text-xs text-emerald-700 underline hover:text-emerald-500"
            >
              ゲームへ戻る
            </Link>
            <Link
              href="/solo"
              className="text-xs text-sky-700 underline hover:text-sky-500"
            >
              ソロメニュー
            </Link>
          </div>
        </header>

        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-4 sm:p-6 space-y-4">
          <section>
            <h2 className="text-sm sm:text-base font-bold mb-2">
              基本ルール
            </h2>
            <ul className="list-disc list-inside text-xs sm:text-sm space-y-1 text-slate-800">
              <li>単一選択（四択など）の問題だけが出題されます。</li>
              <li>制限時間は 3分（180秒）からスタートします。</li>
              <li>
                画面上に並んだ選択肢（的）の中から、正解だと思うものをタップします。
              </li>
              <li>正解の的を撃ち抜くと「ヒット」となり、スコアが+1されます。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm sm:text-base font-bold mb-2">
              時間の増減
            </h2>
            <ul className="list-disc list-inside text-xs sm:text-sm space-y-1 text-slate-800">
              <li>正解すると残り時間が <strong>+2秒</strong> 回復します。</li>
              <li>間違えると残り時間が <strong>-10秒</strong> 減少します。</li>
              <li>残り時間が 0秒 になった時点でゲーム終了です。</li>
              <li>回復しても上限は最初の 3分までです。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm sm:text-base font-bold mb-2">
              得点・記録
            </h2>
            <ul className="list-disc list-inside text-xs sm:text-sm space-y-1 text-slate-800">
              <li>3分間のあいだに正解した数があなたのスコアになります。</li>
              <li>
                プレイ終了時、ブラウザごとに
                <strong>最高記録（自己ベスト）</strong>
                が自動的に保存されます。
              </li>
              <li>
                ソロメニューの「正答スナイパー」のカードに、自己ベストが表示されます。
              </li>
            </ul>
          </section>

          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              href="/solo/sniper"
              className="px-4 py-2 rounded-full bg-emerald-600 text-white text-xs sm:text-sm font-semibold hover:bg-emerald-700"
            >
              正答スナイパーをプレイする
            </Link>
            <Link
              href="/solo"
              className="px-4 py-2 rounded-full border border-slate-300 bg-slate-50 text-xs sm:text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              ソロメニューへ戻る
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
