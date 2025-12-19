// file: app/mistakes/page.js
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

export default function MistakesPage() {
  const [mistakes, setMistakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tab, setTab] = useState('mistakes'); // mistakes / learned
  const [q, setQ] = useState('');
  const [onlyFav, setOnlyFav] = useState(false);

  const fetchMistakes = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/my-mistakes', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || '間違えた問題の取得に失敗しました。');
        setMistakes([]);
        return;
      }
      if (!data.ok) {
        setMistakes([]);
        return;
      }

      const normalized =
        (data.mistakes || []).map((row) => {
          // tags_json を配列に
          let tags = [];
          try {
            if (row.tags_json) {
              const parsed = typeof row.tags_json === 'string' ? JSON.parse(row.tags_json) : row.tags_json;
              if (Array.isArray(parsed)) tags = parsed;
            }
          } catch {
            tags = [];
          }

          // options_json を配列に
          let options = [];
          try {
            if (row.options_json) {
              const parsed = typeof row.options_json === 'string' ? JSON.parse(row.options_json) : row.options_json;
              if (Array.isArray(parsed)) options = parsed;
            }
          } catch {
            options = [];
          }

          return {
            id: row.id,
            questionId: row.question_id,
            wrongCount: row.wrong_count,
            lastWrongAt: row.last_wrong_at,
            question: row.question || '',
            questionType: row.question_type || 'single',
            options,
            correctAnswer: row.correct_answer || '',
            tags,
            isFavorite: !!row.is_favorite,
            isLearned: !!row.is_learned,
          };
        }) || [];

      setMistakes(normalized);
      setError('');
    } catch (e) {
      console.error(e);
      setError('間違えた問題の取得に失敗しました。');
      setMistakes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMistakes();
  }, []);

  const filtered = useMemo(() => {
    const base = mistakes.filter((m) => (tab === 'mistakes' ? !m.isLearned : m.isLearned));

    const byFav = onlyFav ? base.filter((m) => m.isFavorite) : base;

    const qq = q.trim().toLowerCase();
    if (!qq) return byFav;

    return byFav.filter((m) => {
      const s1 = String(m.question || '').toLowerCase();
      const s2 = String(m.correctAnswer || '').toLowerCase();
      const s3 = (m.tags || []).join(' ').toLowerCase();
      return s1.includes(qq) || s2.includes(qq) || s3.includes(qq);
    });
  }, [mistakes, tab, q, onlyFav]);

  const updateMistake = async ({ action, id, value }) => {
    const res = await fetch('/api/mistakes/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id, value }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || data.reason || '更新に失敗しました');
    }
  };


  const onToggleFav = async (m) => {
    try {
      setMistakes((prev) => prev.map((x) => (x.id === m.id ? { ...x, isFavorite: !x.isFavorite } : x)));
      await updateMistake({ action: 'favorite', id: m.id, value: !m.isFavorite });
    } catch (e) {
      console.error(e);
      setError(String(e?.message || e));
      fetchMistakes();
    }
  };

  const onToggleLearned = async (m, learned) => {
    try {
      setMistakes((prev) => prev.map((x) => (x.id === m.id ? { ...x, isLearned: !!learned } : x)));
      await updateMistake({ action: 'learned', id: m.id, value: !!learned });
    } catch (e) {
      console.error(e);
      setError(String(e?.message || e));
      fetchMistakes();
    }
  };

  const onDelete = async (m) => {
    if (!confirm('この問題をリストから削除しますか？')) return;
    try {
      setMistakes((prev) => prev.filter((x) => x.id !== m.id));
      await updateMistake({ action: 'delete', id: m.id });
    } catch (e) {
      console.error(e);
      setError(String(e?.message || e));
      fetchMistakes();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-sky-50 flex items-center justify-center text-slate-900">
        <p className="text-sm">読み込み中です...</p>
      </div>
    );
  }

  const canStart = mistakes.some((m) => !m.isLearned);

  return (
    <div className="min-h-screen bg-sky-50 flex flex-col items-center text-sky-900">
      {/* ヘッダー */}
      <header className="w-full max-w-2xl px-4 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo-skull.png" alt="ナレバト" className="w-8 h-8 object-contain" />
          {/* ★少しだけ小さく */}
          <h1 className="text-lg md:text-xl font-extrabold tracking-widest">
            間違えた問題の復習
          </h1>
        </div>
        {/* ★少しだけ小さく */}
        <Link
          href="/mypage"
          className="border-2 border-sky-600 px-3 py-1 rounded-full text-xs font-bold text-sky-700 bg-white shadow-sm"
        >
          マイページへ戻る
        </Link>
      </header>

      <main className="w-full max-w-2xl px-4 pb-10 mt-4 space-y-4">
        {/* 説明 */}
        <section className="bg-white border border-sky-100 rounded-3xl p-4 shadow-sm text-sm text-slate-800">
          <p>
            レート戦・チャレンジモードで
            <span className="font-bold">間違えた直近2000問</span>
            を表示します。正解を確認して、復習に使ってください。
          </p>
          <p className="mt-1 text-xs text-slate-500">※ 正解した問題は表示されません。</p>

          <div className="mt-3 flex flex-wrap gap-2 items-center">
            {canStart ? (
              <Link
                href="/weak-training"
                className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-emerald-500 text-emerald-50 text-xs font-bold shadow hover:bg-emerald-600"
              >
                弱点克服モードを始める
              </Link>
            ) : (
              <p className="text-xs text-slate-500">
                ※ 間違えた問題が記録されると、弱点克服モードを利用できます。
              </p>
            )}
          </div>
        </section>

        {/* 本体 */}
        <section className="bg-sky-100 border-2 border-sky-500 rounded-3xl p-4 shadow-sm">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-sky-800">問題リスト</h2>
              <p className="text-xs text-slate-700">件数：{mistakes.length} / 2000</p>
            </div>

            {/* タブ */}
            <div className="flex gap-2">
              <button
                onClick={() => setTab('mistakes')}
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  tab === 'mistakes'
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white text-sky-800 border-sky-300'
                }`}
              >
                間違えた
              </button>
              <button
                onClick={() => setTab('learned')}
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  tab === 'learned'
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white text-sky-800 border-sky-300'
                }`}
              >
                覚えた
              </button>

              <label className="ml-auto flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={onlyFav}
                  onChange={(e) => setOnlyFav(e.target.checked)}
                />
                お気に入りのみ
              </label>
            </div>

            {/* 検索 */}
            <div className="flex gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="検索（問題文/正解/タグ）"
                className="flex-1 rounded-xl border border-sky-300 px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
              <button
                onClick={() => setQ('')}
                className="px-3 py-2 rounded-xl bg-white border border-sky-300 text-xs font-bold text-sky-800"
              >
                クリア
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-600 mt-3 whitespace-pre-line">{error}</p>
          )}

          {filtered.length === 0 && !error && (
            <p className="text-sm text-slate-700 mt-3">
              {tab === 'mistakes' ? '間違えた問題はまだありません。' : '覚えた問題はまだありません。'}
            </p>
          )}

          {filtered.length > 0 && (
            <div className="mt-3 space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {filtered.map((m) => (
                <article
                  key={m.id}
                  className="bg-white rounded-2xl shadow-sm border border-sky-100 px-4 py-3 text-sm text-slate-900"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                      {m.tags && m.tags.length > 0 ? m.tags[0] : '不明'}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onToggleFav(m)}
                        className={`px-2 py-1 rounded-full text-[11px] font-bold border ${
                          m.isFavorite
                            ? 'bg-yellow-400 text-slate-900 border-yellow-400'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                        title="お気に入り"
                      >
                        {m.isFavorite ? '★' : '☆'}
                      </button>

                      {tab === 'mistakes' ? (
                        <button
                          onClick={() => onToggleLearned(m, true)}
                          className="px-2 py-1 rounded-full text-[11px] font-bold bg-emerald-500 text-white"
                          title="覚えたに移動"
                        >
                          覚えた
                        </button>
                      ) : (
                        <button
                          onClick={() => onToggleLearned(m, false)}
                          className="px-2 py-1 rounded-full text-[11px] font-bold bg-sky-600 text-white"
                          title="間違えたに戻す"
                        >
                          戻す
                        </button>
                      )}

                      <button
                        onClick={() => onDelete(m)}
                        className="px-2 py-1 rounded-full text-[11px] font-bold bg-rose-500 text-white"
                        title="削除"
                      >
                        削除
                      </button>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500 text-right mb-1">
                    <div>最終ミス: {m.lastWrongAt ? ` ${m.lastWrongAt}` : ' -'}</div>
                    <div>通算ミス回数: {m.wrongCount ?? 1}</div>
                  </div>

                  <p className="font-semibold mb-1">Q. {m.question || '（問題文なし）'}</p>

                  <p className="text-xs text-slate-700 mt-1">
                    正解：{' '}
                    <span className="font-bold">
                      {m.correctAnswer && m.correctAnswer.trim() !== ''
                        ? m.correctAnswer
                        : '（正解データが登録されていません）'}
                    </span>
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
