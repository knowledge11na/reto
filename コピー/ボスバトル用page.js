// file: app/page.js
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// ★ ボスバトルの対象タグ名（将来ここを変えるだけで文言変更できる）
// 例: '東の海' → '頂上戦争' など
const BOSS_TAG_LABEL = '東の海';

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
          typeof data.count === 'number' && data.count > 0
            ? data.count
            : 0;
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
            <span className="font-bold">
              {loading ? '----' : ratingText}
            </span>{' '}
            ／ オンライン：
            <span className="font-bold">{onlineCount}人</span>
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

        {/* フリー対戦 ＆ チャレンジモード */}
        <div className="grid grid-cols-1 gap-4">
          {/* チャレンジモード */}
          <section className="bg-sky-100 border-2 border-emerald-500 rounded-3xl p-4 shadow-sm">
            <h2 className="text-xl font-extrabold mb-2">🔥 チャレンジモード</h2>
            <p className="text-sm mb-2">
              1日1回挑戦可能／3問間違えたら終了
            </p>
            <Link
              href="/challenge"
              className="block w-full text-center py-3 rounded-full text-emerald-50 font-bold bg-emerald-500 active:bg-emerald-600 shadow"
            >
              挑戦する
            </Link>
          </section>
        </div>

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
            <p className="text-[10px] leading-tight mb-1">
              過去のシーズンもこちら
            </p>

            <Link
              href="/ranking"
              className="block w-full text-center py-2 rounded-full text-sky-50 text-sm font-bold bg-sky-500 active:bg-sky-600 shadow"
            >
              ランキングを見る
            </Link>
          </section>
        </div>

        {/* 期間限定イベント：ボスバトル */}
        <section className="bg-slate-900 border-2 border-slate-700 rounded-3xl p-4 shadow-sm text-slate-50 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-2xl">👹</span>
              <div>
                <h2 className="text-base font-extrabold">期間限定イベント</h2>
                <p className="text-[11px] text-slate-300">
                  みんなでボスを倒してご褒美ベリーをゲット！
                </p>
              </div>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 font-bold">
              準備中
            </span>
          </div>

          <div className="bg-slate-800/80 rounded-2xl p-3 border border-slate-600 flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl bg-slate-950/70 flex items-center justify-center text-[10px] text-slate-200 border border-slate-700 overflow-hidden">
              {/* 将来ここにボス画像を置く（/boss-battle/boss-xxx.png） */}
              BOSS
            </div>
            <div className="flex-1 text-[12px] space-y-1">
              <p className="font-semibold text-slate-50">
                「{BOSS_TAG_LABEL}」タグ限定ボスバトル（予定）
              </p>
              <p className="text-slate-300">
                期間中の正解数でみんなの総ダメージが決まる協力イベント。
              </p>
              <p className="text-slate-300">
                成功報酬：参加者全員 2000 ベリー＋貢献ランキング報酬
              </p>
            </div>
          </div>

          {me ? (
            <Link
              href="/boss-battle"
              className="block w-full text-center py-2.5 rounded-full text-slate-900 text-sm font-bold bg-amber-300 hover:bg-amber-400 active:bg-amber-500 shadow"
            >
              ボスバトルに挑戦する
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="block w-full text-center py-2.5 rounded-full text-slate-200 text-sm font-bold bg-slate-600 cursor-not-allowed shadow"
            >
              ボスバトルにはログインが必要です
            </button>
          )}

          <p className="text-[10px] text-slate-400 mt-1">
            ※ 仕様は今後変更される可能性があります（テスト実装中）。
          </p>
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
