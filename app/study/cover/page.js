// file: app/study/cover/page.js
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

function buildSaveKey(mode) {
  return `study_cover_save_${mode || 'chars'}`;
}

export default function StudyCoverPage() {
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  // mode: chars / title / both
  const [mode, setMode] = useState('chars');

  // 設定
  const [optIgnoreWrongAndGo, setOptIgnoreWrongAndGo] = useState(true);

  // hydration対策
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMsg('');
      try {
        const res = await fetch('/api/study/cover', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) {
          setRows([]);
          setMsg(data?.error || `取得失敗（status=${res.status}）`);
          return;
        }
        setRows(data?.rows || []);
      } catch {
        setRows([]);
        setMsg('取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const total = useMemo(() => rows?.length || 0, [rows]);

  const selectedSaveKey = useMemo(() => {
    return buildSaveKey(mode);
  }, [mode]);

  const resumeInfo = useMemo(() => {
    if (!mounted) return null;
    try {
      const raw = window.localStorage.getItem(selectedSaveKey);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      if (typeof obj.idx !== 'number' || typeof obj.total !== 'number') return null;
      return { idx: obj.idx, total: obj.total };
    } catch {
      return null;
    }
  }, [mounted, selectedSaveKey]);

  const startHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set('mode', mode);
    params.set('ignoreWrongAndGo', optIgnoreWrongAndGo ? '1' : '0');
    params.set('resume', '0');
    return `/study/cover/play?${params.toString()}`;
  }, [mode, optIgnoreWrongAndGo]);

  const resumeHref = useMemo(() => {
    const qs = startHref.split('?')[1] || '';
    const params = new URLSearchParams(qs);
    params.set('resume', '1');
    return `/study/cover/play?${params.toString()}`;
  }, [startHref]);

  function resetProgress() {
    if (!mounted) return;
    if (!confirm('このモードの進捗（セーブ）をリセットしますか？')) return;
    try {
      window.localStorage.removeItem(selectedSaveKey);
      setMsg('進捗をリセットしました');
    } catch {
      setMsg('リセットに失敗しました');
    }
  }

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-extrabold">📘 学習：表紙</h1>
          <Link href="/study" className="text-xs font-bold text-sky-700 underline hover:text-sky-500">
            学習メニューへ
          </Link>
        </header>

        <div className="rounded-2xl border border-amber-400 bg-amber-50 p-4 shadow-sm">
          <p className="text-[12px] text-amber-950 leading-relaxed">
            表紙の学習（3モード）
            <br />
            ・キャラのみ：表紙画像＋キャラ順番固定入力
            <br />
            ・巻タイトル：1巻〜順にタイトル入力
            <br />
            ・両方：タイトル＋キャラ入力
          </p>
        </div>

        {msg && (
          <div className="mt-3 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-rose-900 text-xs">
            {msg}
          </div>
        )}

        <div className="mt-4 space-y-3">
          {/* モード */}
          <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <p className="text-sm font-extrabold text-slate-900 mb-2">モード</p>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMode('chars')}
                className={`py-2 rounded-xl text-[12px] font-bold border ${
                  mode === 'chars'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-900 border-slate-300'
                }`}
              >
                キャラのみ
              </button>

              <button
                type="button"
                onClick={() => setMode('title')}
                className={`py-2 rounded-xl text-[12px] font-bold border ${
                  mode === 'title'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-900 border-slate-300'
                }`}
              >
                巻タイトル
              </button>

              <button
                type="button"
                onClick={() => setMode('both')}
                className={`py-2 rounded-xl text-[12px] font-bold border ${
                  mode === 'both'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-900 border-slate-300'
                }`}
              >
                両方
              </button>
            </div>

            <p className="mt-2 text-[11px] text-slate-600">
              データ件数：{loading ? '読み込み中...' : total}
            </p>
          </div>

          {/* 設定 */}
          <div className="rounded-2xl border border-indigo-300 bg-white p-4 shadow-sm">
            <p className="text-sm font-extrabold text-indigo-950 mb-2">開始前設定</p>

            <label className="flex items-start gap-2 text-[12px] text-indigo-950">
              <input
                type="checkbox"
                className="mt-1"
                checked={optIgnoreWrongAndGo}
                onChange={(e) => setOptIgnoreWrongAndGo(e.target.checked)}
              />
              <span>
                <b>間違えても</b>答え表示後に無視して次へ進む（OFFだと正解するまで次へ進まない／
                <b>スキップ</b>のみ次へ）
              </span>
            </label>
          </div>

          {/* 再開 */}
          {resumeInfo && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
              <p className="text-[12px] text-amber-950 font-bold">
                セーブデータあり：{resumeInfo.idx + 1}/{resumeInfo.total}
              </p>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link
                  href={resumeHref}
                  className={`block w-full text-center py-3 rounded-full text-white font-extrabold shadow ${
                    loading || !rows.length ? 'bg-gray-400 pointer-events-none' : 'bg-amber-600 active:bg-amber-700'
                  }`}
                >
                  続きから再開
                </Link>

                <button
                  type="button"
                  onClick={resetProgress}
                  disabled={loading || !rows.length}
                  className={`py-3 rounded-full font-extrabold shadow text-white ${
                    loading || !rows.length ? 'bg-gray-400' : 'bg-rose-600 active:bg-rose-700'
                  }`}
                >
                  進捗リセット
                </button>
              </div>
            </div>
          )}

          {/* 開始 */}
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 shadow-sm">
            <Link
              href={startHref}
              className={`block w-full text-center py-3 rounded-full text-white font-extrabold shadow ${
                loading || !rows.length ? 'bg-gray-400 pointer-events-none' : 'bg-emerald-600 active:bg-emerald-700'
              }`}
            >
              {loading ? '読み込み中...' : '開始'}
            </Link>
          </div>

          <div className="text-center">
            <Link
              href="/"
              className="inline-block px-4 py-2 rounded-full border border-sky-500 bg-white text-xs font-bold text-sky-700 hover:bg-sky-50"
            >
              ホームへ戻る
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
