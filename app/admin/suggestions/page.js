// file: app/admin/suggestions/page.js
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

export default function AdminSuggestionsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('open'); // open / done
  const [msg, setMsg] = useState('');

  const filtered = useMemo(() => {
    return (rows || []).filter((r) => (r?.status || 'open') === tab);
  }, [rows, tab]);

  const load = async () => {
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch('/api/admin/suggestions');
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setMsg(data?.message || data?.error || `取得失敗（status=${res.status}）`);
        setRows([]);
        return;
      }
      setRows(data?.rows || []);
    } catch (e) {
      console.error(e);
      setMsg('取得中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markDone = async (id) => {
    setMsg('');
    try {
      const res = await fetch('/api/admin/suggestions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'done' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setMsg(data?.message || data?.error || `更新失敗（status=${res.status}）`);
        return;
      }
      await load();
    } catch (e) {
      console.error(e);
      setMsg('更新中にエラーが発生しました。');
    }
  };

  const reopen = async (id) => {
    setMsg('');
    try {
      const res = await fetch('/api/admin/suggestions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'open' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setMsg(data?.message || data?.error || `更新失敗（status=${res.status}）`);
        return;
      }
      await load();
    } catch (e) {
      console.error(e);
      setMsg('更新中にエラーが発生しました。');
    }
  };

  const saveNote = async (id, note) => {
    setMsg('');
    try {
      const res = await fetch('/api/admin/suggestions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, adminNote: note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setMsg(data?.message || data?.error || `更新失敗（status=${res.status}）`);
        return;
      }
      await load();
    } catch (e) {
      console.error(e);
      setMsg('更新中にエラーが発生しました。');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold">📮 目安箱（管理者）</h1>
          <Link
            href="/admin"
            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-sm font-bold"
          >
            管理ダッシュボードへ
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('open')}
            className={`px-3 py-2 rounded-lg border text-sm font-bold ${
              tab === 'open'
                ? 'bg-amber-600 border-amber-300 text-white'
                : 'bg-slate-900 border-slate-700 text-slate-200'
            }`}
          >
            未対応
          </button>
          <button
            type="button"
            onClick={() => setTab('done')}
            className={`px-3 py-2 rounded-lg border text-sm font-bold ${
              tab === 'done'
                ? 'bg-emerald-700 border-emerald-300 text-white'
                : 'bg-slate-900 border-slate-700 text-slate-200'
            }`}
          >
            対応済み
          </button>

          <button
            type="button"
            onClick={load}
            className="ml-auto px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-sm font-bold"
          >
            再読み込み
          </button>
        </div>

        {msg && (
          <div className="text-sm font-bold text-rose-200 bg-rose-950 border border-rose-700 rounded-xl p-3 whitespace-pre-line">
            {msg}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-slate-300">読み込み中…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-slate-300">該当なし</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <SuggestionCard
                key={r.id}
                row={r}
                onDone={() => markDone(r.id)}
                onReopen={() => reopen(r.id)}
                onSaveNote={(note) => saveNote(r.id, note)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestionCard({ row, onDone, onReopen, onSaveNote }) {
  const [note, setNote] = useState(row?.admin_note || '');
  const created = row?.created_at
    ? new Date(row.created_at).toLocaleString('ja-JP')
    : '--';

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-extrabold">
            #{row.id} / {row.category || 'general'} / {row.status}
          </div>
          <div className="text-xs text-slate-300">
                        {created} / 投稿者：{row.user_name || '（不明）'}
            {row.user_id_text ? `（ID:${row.user_id_text}）` : ''}
          </div>
        </div>

        {row.status === 'open' ? (
          <button
            type="button"
            onClick={onDone}
            className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 border border-emerald-300 text-sm font-bold"
          >
            対応済みにする
          </button>
        ) : (
          <button
            type="button"
            onClick={onReopen}
            className="px-3 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 border border-amber-300 text-sm font-bold"
          >
            未対応に戻す
          </button>
        )}
      </div>

      <div className="bg-slate-950 border border-slate-700 rounded-xl p-3 whitespace-pre-line text-sm text-slate-100">
        {row.body}
      </div>

      <div className="space-y-2">
        <div className="text-sm font-bold text-slate-200">管理メモ</div>
        <textarea
          className="w-full min-h-[90px] px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-slate-100"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="対応内容やメモを書けます"
        />
        <button
          type="button"
          onClick={() => onSaveNote(note)}
          className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-sm font-bold"
        >
          メモを保存
        </button>
      </div>
    </div>
  );
}
