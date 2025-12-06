// file: app/solo/meteor/rules/page.js
'use client';

import Link from 'next/link';

export default function MeteorRulesPage() {
  return (
    <main className="min-h-screen bg-sky-50 text-slate-900">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-xl sm:text-2xl font-extrabold">
            隕石クラッシュ（ルール）
          </h1>
          <div className="flex gap-2 text-xs">
            <Link
              href="/solo/meteor"
              className="px-3 py-1 rounded-full bg-sky-500 text-white font-semibold hover:bg-sky-600"
            >
              隕石クラッシュへ戻る
            </Link>
            <Link
              href="/"
              className="px-3 py-1 rounded-full border border-sky-400 bg-white text-sky-700 font-semibold hover:bg-sky-50"
            >
              ホームへ戻る
            </Link>
          </div>
        </header>

        <section className="bg-white rounded-2xl shadow-sm border border-sky-100 p-4 sm:p-5 space-y-3 text-sm leading-relaxed">
          <h2 className="font-bold text-sky-800 mb-1">
            基本ルール
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>制限時間は合計10分。</li>
            <li>画面上には常に最大3つの「隕石（問題）」が出現します。</li>
            <li>
              どの隕石から答えてもOK。正解した隕石だけ撃ち落とされ、新しい隕石が出現します。
            </li>
            <li>
              隕石には <strong>記述式の問題文</strong> が表示されます。
            </li>
          </ul>

          <h2 className="font-bold text-sky-800 mt-3 mb-1">
            時間のルール
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              各隕石には「個別の制限時間」があり、時間に応じて画面の上から下へ落ちてきます。
            </li>
            <li>
              答えの文字数が長い問題ほど、落ちるスピード（制限時間）がゆっくりになります。
            </li>
            <li>
              どれかの隕石が自機に到達すると<strong>被弾</strong>となり、
              合計残り時間が <strong>30秒減少</strong>します。
            </li>
          </ul>

          <h2 className="font-bold text-sky-800 mt-3 mb-1">
            回答のしかた
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              自機の下にある <strong>共通の回答欄</strong> に答えを入力します。
            </li>
            <li>
              入力した答えが、画面上の3つの隕石のどれか1つでも正解と一致したら、
              その隕石だけが撃ち落とされます。
            </li>
            <li>
              Enterキー、または「発射」ボタンで回答を送信できます。
            </li>
            <li>
              不正解の場合はペナルティはありませんが、隕石はそのまま落下し続けます。
            </li>
          </ul>

          <h2 className="font-bold text-sky-800 mt-3 mb-1">
            スコアと自己ベスト
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>撃ち落とした隕石の数がスコアになります。</li>
            <li>
              プレイ終了時点でのスコアが、これまでの自己ベストを超えている場合、
              そのブラウザに<strong>自己ベストとして保存</strong>されます。
            </li>
            <li>
              自己ベストは、隕石クラッシュ画面の上部に表示されます。
            </li>
          </ul>

          <p className="text-xs text-slate-500 mt-3">
            ※現在はベリーやランキングへの反映はありません（ソロ練習モードです）。
          </p>
        </section>
      </div>
    </main>
  );
}
