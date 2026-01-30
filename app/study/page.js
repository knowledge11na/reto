// file: app/study/page.js
'use client';

import Link from 'next/link';

export default function StudyMenuPage() {
  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-extrabold">📘 学習メニュー</h1>
          <Link href="/" className="text-xs font-bold text-sky-700 underline hover:text-sky-500">
            ホームに戻る
          </Link>
        </header>

        <p className="text-[12px] text-sky-900 mb-4">
          カテゴリ別に練習できます（中身はあとで追加）。
        </p>

        <div className="space-y-3">
          {/* 技 */}
          <div className="rounded-2xl border border-teal-400 bg-teal-50 px-3 py-3 shadow-sm">
            <Link
              href="/study/waza"
              className="block hover:bg-teal-100 rounded-2xl -mx-3 -my-3 px-3 py-3 transition"
            >
              <p className="text-sm font-bold text-teal-900">技</p>
              <p className="text-[11px] text-teal-950 leading-tight mt-1">技の学習ページ</p>
            </Link>
          </div>

          {/* サブタイ */}
          <div className="rounded-2xl border border-cyan-400 bg-cyan-50 px-3 py-3 shadow-sm">
            <Link
              href="/study/subtitle"
              className="block hover:bg-cyan-100 rounded-2xl -mx-3 -my-3 px-3 py-3 transition"
            >
              <p className="text-sm font-bold text-cyan-900">サブタイ</p>
              <p className="text-[11px] text-cyan-950 leading-tight mt-1">
                サブタイトルの学習ページ
              </p>
            </Link>
          </div>

          {/* 扉絵サブタイ */}
          <div className="rounded-2xl border border-violet-500 bg-violet-50 px-3 py-3 shadow-sm">
            <Link
              href="/study/door"
              className="block hover:bg-violet-100 rounded-2xl -mx-3 -my-3 px-3 py-3 transition"
            >
              <p className="text-sm font-bold text-violet-900">扉絵サブタイ</p>
              <p className="text-[11px] text-violet-950 leading-tight mt-1">
                扉絵サブタイトルの学習ページ
              </p>
            </Link>
          </div>

          {/* 表紙 */}
          <div className="rounded-2xl border border-amber-500 bg-amber-50 px-3 py-3 shadow-sm">
            <Link
              href="/study/cover"
              className="block hover:bg-amber-100 rounded-2xl -mx-3 -my-3 px-3 py-3 transition"
            >
              <p className="text-sm font-bold text-amber-900">表紙</p>
              <p className="text-[11px] text-amber-950 leading-tight mt-1">表紙の学習ページ</p>
            </Link>
          </div>
        </div>

        <div className="mt-6 text-center">
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
