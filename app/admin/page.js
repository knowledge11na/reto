// file: app/admin/page.js
'use client';

import { useEffect, useState } from 'react';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);

  // シーズンリセット関連
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  useEffect(() => {
    fetch('/api/admin/users?mode=stats')
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {});
  }, []);

  const handleSeasonReset = async () => {
    if (resetLoading) return;

    const ok = window.confirm(
      '本当にシーズン締め処理を実行しますか？\n\n' +
        '・全ユーザーのレートを 1500 にリセット\n' +
        '・勝敗数、連勝数も初期化\n\n' +
        '※ この操作は管理者のみ実行できます。'
    );
    if (!ok) return;

    setResetLoading(true);
    setResetMessage('');

    try {
      // Vercel の cron と同じエンドポイントを叩く
      const res = await fetch('/api/admin/close-season', {
        method: 'GET',
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        setResetMessage(
          data.error ||
            'シーズンリセットに失敗しました。時間をおいて再度お試しください。'
        );
        return;
      }

      const newSeasonLabel = data.newSeason
        ? `（新シーズンコード: ${data.newSeason}）`
        : '';

      setResetMessage(`シーズン締め処理が完了しました。${newSeasonLabel}`);

      // ついでに stats も軽く更新しておく（必要なら）
      setStats((prev) => ({
        ...(prev || {}),
        lastSeasonClosedAt: new Date().toISOString(),
      }));
    } catch (e) {
      console.error(e);
      setResetMessage('シーズンリセット中にサーバーエラーが発生しました。');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold mb-2">ダッシュボード</h1>

      {/* 概要カード */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
          <div className="text-xs text-slate-400 mb-1">登録ユーザー数</div>
          <div className="text-3xl font-bold">{stats?.userCount ?? '--'}</div>
        </div>
        <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
          <div className="text-xs text-slate-400 mb-1">承認待ち問題</div>
          <div className="text-3xl font-bold">
            {stats?.pendingQuestions ?? '--'}
          </div>
        </div>
        <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
          <div className="text-xs text-slate-400 mb-1">未対応の不備報告</div>
          <div className="text-3xl font-bold">{stats?.openReports ?? '--'}</div>
        </div>
      </section>

      {/* ショートカット */}
      <section className="bg-slate-900 rounded-xl p-4 border border-slate-700 space-y-3">
        <h2 className="text-lg font-bold">ショートカット</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <a
            href="/admin/questions"
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600"
          >
            📝 問題一覧・承認画面へ
          </a>
          <a
            href="/admin/reports"
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600"
          >
            ⚠ 不備報告一覧へ
          </a>
          <a
            href="/admin/users"
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600"
          >
            🏴‍☠️ ユーザー＆ランキングへ
          </a>
          <a
            href="/admin/endless"
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600"
          >
            ♾ エンドレスモードを始める
          </a>

          {/* ★追加：音声学習モード */}
          <a
            href="/admin/voice-learning"
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600"
          >
            ♬ 音声学習モード
          </a>
        </div>
      </section>

      {/* シーズン管理（リセットボタン） */}
      <section className="bg-slate-900 rounded-xl p-4 border border-rose-700 space-y-3">
        <h2 className="text-lg font-bold text-rose-100">シーズン管理</h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          「シーズン締め処理」を実行すると、全ユーザーのレート・戦績を
          <span className="font-bold text-rose-200">新シーズン開始用にリセット</span>
          します。
          <br />
          Vercel の Cron により毎月1日 0:00 に自動実行されますが、テスト用に手動実行することもできます。
        </p>

        <button
          type="button"
          onClick={handleSeasonReset}
          disabled={resetLoading}
          className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-sm font-bold text-white border border-rose-400"
        >
          {resetLoading ? 'シーズン締め処理 実行中…' : 'シーズン締め処理を今すぐ実行する'}
        </button>

        {resetMessage && (
          <p className="text-xs mt-2 text-rose-200 whitespace-pre-line">
            {resetMessage}
          </p>
        )}
      </section>
    </div>
  );
}
