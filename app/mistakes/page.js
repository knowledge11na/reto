// file: app/mistakes/page.js
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function MistakesPage() {
  const [mistakes, setMistakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchMistakes = async () => {
      try {
        const res = await fetch('/api/my-mistakes', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(data.error || '間違えた問題の取得に失敗しました。');
          setMistakes([]);
          return;
        }

        if (!data.ok) {
          // NOT_LOGGED_IN など
          setMistakes([]);
          return;
        }

        const normalized =
          (data.mistakes || []).map((row) => {
            // tags_json を配列に
            let tags = [];
            try {
              if (row.tags_json) {
                const parsed = JSON.parse(row.tags_json);
                if (Array.isArray(parsed)) tags = parsed;
              }
            } catch {
              tags = [];
            }

            // options_json を配列に（今は表示してないけど一応）
            let options = [];
            try {
              if (row.options_json) {
                const parsed = JSON.parse(row.options_json);
                if (Array.isArray(parsed)) options = parsed;
              }
            } catch {
              options = [];
            }

            return {
              id: row.id, // ★ React の key 用にこれを使う
              questionId: row.question_id,
              wrongCount: row.wrong_count,
              lastWrongAt: row.last_wrong_at,
              question: row.question || '',
              questionType: row.question_type || 'single',
              options,
              correctAnswer: row.correct_answer || '',
              tags,
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

    fetchMistakes();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-sky-50 flex items-center justify-center text-slate-900">
        <p className="text-sm">読み込み中です...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sky-50 flex flex-col items-center text-sky-900">
      {/* ヘッダー */}
      <header className="w-full max-w-2xl px-4 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src="/logo-skull.png"
            alt="ナレバト"
            className="w-8 h-8 object-contain"
          />
          <h1 className="text-xl md:text-2xl font-extrabold tracking-widest">
            間違えた問題の復習
          </h1>
        </div>
        <Link
          href="/mypage"
          className="border-2 border-sky-600 px-3 py-1 rounded-full text-sm font-bold text-sky-700 bg-white shadow-sm"
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
          <p className="mt-1 text-xs text-slate-500">
            ※ 正解した問題は表示されません。
          </p>

          <div className="mt-3">
            {mistakes.length > 0 ? (
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
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-extrabold text-sky-800">
              間違えた問題一覧
            </h2>
            <p className="text-xs text-slate-700">
              件数：{mistakes.length} / 2000
            </p>
          </div>

          {error && (
            <p className="text-xs text-rose-600 mb-2 whitespace-pre-line">
              {error}
            </p>
          )}

          {mistakes.length === 0 && !error && (
            <p className="text-sm text-slate-700">
              間違えた問題はまだ記録されていません。
            </p>
          )}

          {mistakes.length > 0 && (
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {mistakes.map((m) => (
                <article
                  key={m.id} // ★ ここを questionId ではなく id に
                  className="bg-white rounded-2xl shadow-sm border border-sky-100 px-4 py-3 text-sm text-slate-900"
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                      {m.tags && m.tags.length > 0 ? m.tags[0] : '不明'}
                    </span>
                    <div className="text-[11px] text-slate-500 text-right">
                      <div>
                        最終ミス:
                        {m.lastWrongAt ? ` ${m.lastWrongAt}` : ' -'}
                      </div>
                      <div>通算ミス回数: {m.wrongCount ?? 1}</div>
                    </div>
                  </div>

                  <p className="font-semibold mb-1">
                    Q. {m.question || '（問題文なし）'}
                  </p>

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
