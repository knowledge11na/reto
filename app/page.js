// file: app/page.js
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import ThemeSuggestModal from '@/components/ThemeSuggestModal';

export default function HomePage() {
  const [me, setMe] = useState(null);
  const [onlineCount, setOnlineCount] = useState('×');
  const [season, setSeason] = useState('');
  const [loading, setLoading] = useState(true);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);

  useEffect(() => {
    // 自分の情報
    fetch('/api/me')
      .then((res) => res.json())
      .then((data) => {
        setMe(data.user ?? null);
        setSeason(data.season ?? '');
      })
      .catch(() => {
        setMe(null);
      })
      .finally(() => setLoading(false));

    // オンライン人数
    fetch('/api/online-count')
      .then((res) => res.json())
      .then((data) => {
        const value =
          typeof data.count === 'number'
            ? data.count
            : typeof data.onlineCount === 'number'
            ? data.onlineCount
            : '×';
        setOnlineCount(value);
      })
      .catch(() => setOnlineCount('×'));

    // お知らせ未読件数
    fetch('/api/announcements/unread-count')
      .then((res) => res.json())
      .then((data) => {
        const c =
          typeof data.count === 'number' && data.count > 0 ? data.count : 0;
        setUnreadAnnouncements(c);
      })
      .catch(() => setUnreadAnnouncements(0));
  }, []);

  const ratingText =
    typeof me?.rating === 'number' ? Math.round(me.rating) : '----';

  return (
    <div className="min-h-screen bg-sky-50 text-sky-900 flex flex-col items-center">
      {/* ヘッダー */}
      <header className="w-full max-w-md px-4 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src="/logo-skull.png"
            alt="ナレバト"
            className="w-20 h-20 object-contain"
          />
          <h1 className="text-2xl font-extrabold tracking-widest">ナレバト</h1>
        </div>

        {/* 右上ボタンエリア */}
        <div className="flex flex-col items-end gap-1">
          {/* 上段：お知らせアイコン + マイページ */}
          <div className="flex items-center gap-1">
            <div className="relative">
              <Link
                href="/announcements"
                className="flex items-center justify-center w-9 h-9 rounded-full bg-white border-2 border-amber-500 text-amber-600 text-lg shadow-sm hover:bg-amber-50"
                aria-label="運営からのお知らせ"
              >
                📢
              </Link>
              {/* 未読があるときだけ赤丸を表示（ログイン中のみ） */}
              {me && unreadAnnouncements > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[11px] font-bold text-white flex items-center justify-center border border-white shadow-sm">
                  {unreadAnnouncements > 9 ? '9+' : unreadAnnouncements}
                </span>
              )}
            </div>

            <Link
              href="/mypage"
              className="border-2 border-sky-600 px-3 py-1 rounded-full text-sm font-bold text-sky-700 bg-white shadow-sm hover:bg-sky-50"
            >
              マイページ
            </Link>
          </div>

          {/* 下段：ログイン / 新規登録 */}
          <Link
            href="/login"
            className="px-3 py-1 rounded-full text-[12px] font-bold text-sky-700 bg-sky-100 border border-sky-400 shadow-sm hover:bg-sky-200"
          >
            ログイン / 新規登録
          </Link>
        </div>
      </header>

      {/* メイン */}
      <main className="w-full max-w-md px-4 pb-10 mt-4 space-y-4">
        {/* 🚩 ランダム対戦（レート戦） */}
        <section className="bg-sky-100 border-2 border-sky-500 rounded-3xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🚩</span>
            <h2 className="text-xl font-extrabold">ランダム対戦開始</h2>
          </div>
          <p className="text-sm mb-1">自動でマッチング開始</p>
          <p className="text-sm mb-3">
            現在レート：
            <span className="font-bold">{loading ? '----' : ratingText}</span> ／
            オンライン：<span className="font-bold">{onlineCount}人</span>
          </p>

          {/* ログインしてなければ押せない */}
          {me ? (
            <Link
              href="/rate-match"
              className="block w-full text-center py-3 rounded-full text-white font-bold text-lg shadow bg-sky-500 active:bg-sky-600"
            >
              レート戦を始める
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="block w-full text-center py-3 rounded-full text-white font-bold text-lg shadow bg-gray-400 cursor-not-allowed"
            >
              ログインが必要です
            </button>
          )}
        </section>

        {/* チャレンジモード */}
        <section className="bg-sky-100 border-2 border-emerald-500 rounded-3xl p-4 shadow-sm">
          <h2 className="text-xl font-extrabold mb-2">🔥 チャレンジモード</h2>
          <p className="text-sm mb-2">1日1回挑戦可能／3問間違えたら終了</p>
          <Link
            href="/challenge"
            className="block w-full text-center py-3 rounded-full text-emerald-50 font-bold bg-emerald-500 active:bg-emerald-600 shadow"
          >
            挑戦する
          </Link>
        </section>

        {/* 🎮 ソロゲームにまとめて移動（1ボタンだけ） */}
        <section className="bg-sky-100 border-2 border-violet-500 rounded-3xl p-4 shadow-sm">
          <h2 className="text-xl font-extrabold mb-2">🎮 ソロゲーム</h2>
          <p className="text-[11px] text-sky-900 mb-3">
            1人で黙々と遊べる練習モード。レートは変動しません。
          </p>
          {me ? (
            <Link
              href="/solo"
              className="block w-full text-center py-3 rounded-full text-violet-50 font-bold bg-violet-500 active:bg-violet-600 shadow"
            >
              ソロゲームをする
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="block w-full text-center py-3 rounded-full text-violet-50 font-bold bg-gray-400 cursor-not-allowed shadow"
            >
              ログインが必要です
            </button>
          )}
        </section>
        {/* 📘 学習（ソロゲームの下） */}
        <section className="bg-sky-100 border-2 border-indigo-500 rounded-3xl p-4 shadow-sm">
          <h2 className="text-xl font-extrabold mb-2">📘 学習</h2>
          <p className="text-[11px] text-sky-900 mb-3">
            技・サブタイトルなどをカテゴリ別に練習できます。
          </p>

          {me ? (
            <Link
              href="/study"
              className="block w-full text-center py-3 rounded-full text-indigo-50 font-bold bg-indigo-500 active:bg-indigo-600 shadow"
            >
              学習する
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="block w-full text-center py-3 rounded-full text-indigo-50 font-bold bg-gray-400 cursor-not-allowed shadow"
            >
              ログインが必要です
            </button>
          )}
        </section>


        {/* 問題投稿 & ランキング */}
        <div className="grid grid-cols-2 gap-4">
          {/* 問題投稿 */}
          <section className="bg-sky-100 border-2 border-sky-500 rounded-3xl p-3 shadow-sm">
            <h2 className="text-base font-extrabold mb-1">🗻 問題投稿</h2>
            <p className="text-[10px] leading-tight mb-2">
              レート戦、チャレンジモードの問題を投稿
            </p>

            {/* ログインしてなきゃ押せない */}
            {me ? (
              <Link
                href="/submit"
                className="block w-full text-center py-2 rounded-full text-sky-50 text-sm font-bold bg-sky-500 active:bg-sky-600 shadow"
              >
                問題を投稿する
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="block w-full text-center py-2 rounded-full text-sky-50 text-sm font-bold bg-gray-400 cursor-not-allowed shadow"
              >
                ログインが必要です
              </button>
            )}
          </section>

          {/* ランキング */}
          <section className="bg-sky-100 border-2 border-sky-500 rounded-3xl p-3 shadow-sm">
            <h2 className="text-base font-extrabold mb-1">🏆 ランキング</h2>
            <p className="text-[10px] leading-tight mb-1">
              シーズンの TOP10 をチェック！
            </p>
            <p className="text-[10px] leading-tight mb-1">過去のシーズンもこちら</p>

            <Link
              href="/ranking"
              className="block w-full text-center py-2 rounded-full text-sky-50 text-sm font-bold bg-sky-500 active:bg-sky-600 shadow"
            >
              ランキングを見る
            </Link>
          </section>
        </div>

        {/* 目安箱（運営への意見投稿） */}
        <section className="bg-sky-100 border-2 border-amber-500 rounded-3xl p-4 shadow-sm">
          <h2 className="text-xl font-extrabold mb-2">📮 目安箱</h2>
          <p className="text-[11px] text-sky-900 mb-3">
            運営への意見・改善案・不具合の報告などを送れます。
          </p>

          {me ? (
            <Link
              href="/suggestions"
              className="block w-full text-center py-3 rounded-full text-white font-bold text-lg shadow bg-amber-500 active:bg-amber-600"
            >
              目安箱に送る
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="block w-full text-center py-3 rounded-full text-white font-bold text-lg shadow bg-gray-400 cursor-not-allowed"
            >
              ログインが必要です
            </button>
          )}
        </section>



        {/* フッターリンク */}
        <footer className="mt-6 text-center space-y-2">
          <Link
            href="/info/berries"
            className="text-sky-800 font-bold underline hover:text-sky-600 text-sm"
          >
            ベリーの獲得方法
          </Link>

          <br />

          <Link
            href="/info/posting"
            className="text-sky-800 font-bold underline hover:text-sky-600 text-sm"
          >
            問題投稿について
          </Link>

          <br />

          <Link
            href="/info/terms"
            className="text-sky-800 font-bold underline hover:text-sky-600 text-sm"
          >
            その他 / 利用規約
          </Link>
        </footer>
      </main>
    </div>
  );
}
