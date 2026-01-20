// file: components/ThemeSuggestModal.js
'use client';

import { useState } from 'react';

function cls(...xs) {
  return xs.filter(Boolean).join(' ');
}

// ★ result から kind を推測（APIが kind を返さない時の保険）
function inferKind(result, requestedKind) {
  const d = result?.draft;

  // APIが明示してきた kind があれば最優先
  if (result?.kind) return result.kind;

  // requested が any じゃなければそれを採用
  if (requestedKind && requestedKind !== 'any') return requestedKind;

  // draft の形から推測
  // waza: question + options + correct がある想定
  if (d?.question && Array.isArray(d?.options) && d?.options.length > 0 && d?.correct) {
    return 'waza';
  }

  // subtitles: source.ep & source.subtitle がある想定
  if (d?.source?.ep && d?.source?.subtitle) {
    return 'subtitles';
  }

  // char: character がある想定
  if (d?.character) {
    return 'char';
  }

  // fallback
  return 'any';
}

export default function ThemeSuggestModal({ onApply }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  async function fetchIdea(kind = 'any') {
    setLoading(true);
    setErr('');
    try {
      const r = await fetch(
        `/api/suggest/quiz?kind=${encodeURIComponent(kind)}&reload=1`,
        { cache: 'no-store' }
      );
      const j = await r.json();
      if (!j?.ok) throw new Error('取得に失敗しました');

      const result = j.result || null;

      if (result) {
        const k = inferKind(result, kind);
        setRes({ ...result, kind: k });
      } else {
        setRes(null);
      }
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  function openModal() {
    setOpen(true);
    setRes(null);
    setErr('');
    fetchIdea('any');
  }

  function closeModal() {
    setOpen(false);
    setLoading(false);
    setErr('');
  }

  async function copyToClipboard() {
    if (!res) return;
    const text = [
      `【テーマ】${res.title}`,
      `【kind】${res.kind || 'unknown'}`,
      '',
      ...(res.idea || []).map((x) => `- ${x}`),
      '',
      res.draft ? `【ドラフト】\n${JSON.stringify(res.draft, null, 2)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {}
  }

  function applyDraft() {
    if (!res) return;

    // ★ 念のため：関数が渡ってないケースを可視化
    if (typeof onApply !== 'function') {
      console.warn('[ThemeSuggestModal] onApply is not a function', onApply);
      closeModal();
      return;
    }

    onApply(res);
    closeModal();
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={cls(
          'inline-flex items-center gap-2',
          'px-3 py-1.5 rounded-full',
          'border border-sky-300 bg-white/80',
          'text-xs font-bold text-sky-800',
          'hover:bg-white active:scale-[0.98] transition'
        )}
        title="クイズのテーマ案を提案してもらう"
      >
        <span aria-hidden>💡</span>
        クイズジェネレーター
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={closeModal}
        >
          <div
            className="w-full max-w-xl rounded-2xl bg-white text-black shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b px-4 py-3">
              <div className="text-base font-bold">テーマ相談</div>
              <div className="text-xs opacity-70">「別の案」でまたランダム表示</div>
            </div>

            <div className="px-4 py-4">
              {loading && <div className="text-sm">読み込み中...</div>}

              {!loading && err && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                  {err}
                </div>
              )}

              {!loading && !err && res && (
                <>
                  <div className="rounded-xl border p-3">
                    <div className="text-sm font-bold">{res.title}</div>
                    <div className="mt-1 text-[11px] text-slate-600">
                      kind：<span className="font-bold">{res.kind || 'any'}</span>
                    </div>

                    <ul className="mt-2 list-disc pl-5 text-sm">
                      {(res.idea || []).map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>

                    {res.draft && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm font-bold">
                          ドラフト（開く）
                        </summary>
                        <pre className="mt-2 overflow-auto rounded-lg bg-gray-50 p-2 text-xs">
                          {JSON.stringify(res.draft, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => fetchIdea('any')}
                      className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      別の案
                    </button>

                    <button
                      type="button"
                      onClick={copyToClipboard}
                      className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      コピー
                    </button>

                    <button
                      type="button"
                      onClick={applyDraft}
                      className="rounded-xl px-3 py-2 text-sm font-bold text-white bg-sky-600 hover:bg-sky-700"
                    >
                      この案を使う
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="border-t px-4 py-3">
              <button
                type="button"
                onClick={closeModal}
                className="w-full rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
