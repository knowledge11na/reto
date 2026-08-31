// file: app/tenipuri/page.js

'use client';

import Link from 'next/link';

export default function TenipuriPage() {
  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-md mx-auto px-4 py-6">

        {/* ヘッダー */}
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-extrabold">
            テニプリ
          </h1>

          <Link
            href="/"
            className="text-xs font-bold text-sky-700 underline hover:text-sky-500"
          >
            ホームに戻る
          </Link>
        </header>

        {/* 打球クイズ */}
        <section className="mb-6">
          <h2 className="text-lg font-extrabold mb-3">
            打球クイズ
          </h2>

          <div className="space-y-3">

            {/* 打球打ち返しモード */}
            <Link
              href="/tenipuri/meteor"
              className="block rounded-2xl border-2 border-indigo-400 bg-indigo-50 px-4 py-4 shadow-sm hover:bg-indigo-100 transition"
            >
              <p className="text-base font-extrabold text-indigo-900">
                打球打ち返しモード
              </p>

              <p className="text-[12px] text-indigo-950 leading-relaxed mt-1">
                テニスの王子様に登場する打球を当てるクイズ。
              </p>
            </Link>

            {/* 問題投稿 */}
            <Link
              href="/tenipuri/submit"
              className="block rounded-2xl border-2 border-emerald-400 bg-emerald-50 px-4 py-4 shadow-sm hover:bg-emerald-100 transition"
            >
              <p className="text-base font-extrabold text-emerald-900">
                打球問題を投稿
              </p>

              <p className="text-[12px] text-emerald-950 leading-relaxed mt-1">
                打球画像と「誰が・誰に打ったか」を登録します。
              </p>
            </Link>

            {/* 問題管理 */}
            <Link
              href="/tenipuri/problems"
              className="block rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 py-4 shadow-sm hover:bg-amber-100 transition"
            >
              <p className="text-base font-extrabold text-amber-900">
                打球問題一覧・管理
              </p>

              <p className="text-[12px] text-amber-950 leading-relaxed mt-1">
                登録された打球問題を確認・修正できます。
              </p>
            </Link>

          </div>
        </section>

        {/* 戻る */}
        <div className="mt-8 text-center">
          <Link
            href="/"
            className="inline-block px-4 py-2 rounded-full border border-sky-500 bg-white text-xs font-bold text-sky-700 hover:bg-sky-50"
          >
            ホームへ戻る
          </Link>
        </div>

      </div>
    </main>
  );
}