// file: app/admin/whois/page.js
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AdminWhoisPage() {
  const [status, setStatus] = useState('pending');
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (q) params.set('q', q);

      const res = await fetch(`/api/admin/whois?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      setItems(data.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const approve = async (id) => {
    if (!window.confirm(`承認しますか？ (id=${id})`)) return;
    const res = await fetch('/api/admin/whois/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      alert(data.error || '承認に失敗しました');
      return;
    }
    load();
  };

  const reject = async (id) => {
    const reason = window.prompt('却下理由（任意）');
    const res = await fetch('/api/admin/whois/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      alert(data.error || '却下に失敗しました');
      return;
    }
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-50">私は誰でしょう：承認</h1>
        <div className="flex gap-2">
          <Link
            href="/admin/questions"
            className="px-3 py-1 rounded-full border border-slate-600 text-slate-100 text-xs"
          >
            通常問題へ
          </Link>
          <Link
            href="/"
            className="px-3 py-1 rounded-full border border-slate-600 text-slate-100 text-xs"
          >
            ホーム
          </Link>
        </div>
      </div>

      <section className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-3">
        <div className="flex gap-2 text-xs flex-wrap">
          {['pending', 'approved', 'rejected', ''].map((s) => (
            <button
              key={s || 'all'}
              className={`px-3 py-1 rounded-full border ${
                status === s ? 'bg-sky-500 text-black border-sky-300' : 'border-slate-600 text-slate-100'
              }`}
              onClick={() => setStatus(s)}
            >
              {s === 'pending' && '承認待ち'}
              {s === 'approved' && '承認済み'}
              {s === 'rejected' && '却下済み'}
              {s === '' && 'すべて'}
            </button>
          ))}

          <div className="ml-auto flex gap-2">
            <input
              className="px-2 py-1 rounded bg-slate-800 border border-slate-600 text-slate-50 text-xs"
              placeholder="答え/ヒントで検索"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') load();
              }}
            />
            <button className="px-3 py-1 rounded bg-sky-600 text-xs text-white" onClick={load}>
              🔍
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-400">{loading ? '読み込み中…' : `${items.length}件`}</div>

        <div className="space-y-2 max-h-[65vh] overflow-y-auto">
          {items.map((x) => (
            <div key={x.id} className="border border-slate-700 rounded-lg p-2 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-bold text-slate-50">
                  #{x.id} [{x.status}]
                </div>
                <div className="flex gap-1">
                  {x.status !== 'approved' && (
                    <button className="px-2 py-1 rounded bg-emerald-500 text-black" onClick={() => approve(x.id)}>
                      ✅ 承認
                    </button>
                  )}
                  {x.status !== 'rejected' && (
                    <button className="px-2 py-1 rounded bg-rose-500 text-black" onClick={() => reject(x.id)}>
                      ❌ 却下
                    </button>
                  )}
                </div>
              </div>

              <div className="text-amber-200 font-bold">
                答え: {x.answer}
                {x.alt_answers?.length ? <span> / 別解: {x.alt_answers.join('、')}</span> : null}
              </div>

              <div className="space-y-1">
                {(x.hints || []).map((h, i) => (
                  <div key={i} className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100">
                    ヒント{i + 1}: {h}
                  </div>
                ))}
              </div>

              {(x.author_display_name || x.author_username) && (
                <div className="text-slate-300">
                  作問者: {x.author_display_name || x.author_username}
                  {x.author_user_id ? <>（ID:{x.author_user_id}）</> : null}
                </div>
              )}
            </div>
          ))}

          {items.length === 0 && <div className="text-xs text-slate-400">該当なし</div>}
        </div>
      </section>
    </div>
  );
}
