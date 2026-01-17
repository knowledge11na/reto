// file: app/solo/whois/submit/page.js
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

function cleanArray(arr) {
  return (arr || []).map((s) => String(s ?? '').trim()).filter((s) => s.length > 0);
}

// クォート内改行を維持しつつ行分割
function splitCsvLines(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < (text || '').length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current.trim() !== '') lines.push(current);
      current = '';
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '') lines.push(current);
  return lines;
}

function detectDelimiter(text) {
  const sample = (text || '').slice(0, 2000);
  const tabCount = (sample.match(/\t/g) || []).length;
  const commaCount = (sample.match(/,/g) || []).length;
  return tabCount > commaCount ? '\t' : ',';
}

function parseDelimitedLine(line, delimiter) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < (line || '').length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((s) => String(s ?? '').trim());
}

// questionセルから「ヒント配列」を抽出
function extractHintsFromQuestionCell(q) {
  const raw = String(q ?? '').replace(/\r/g, '\n');

  // 先頭に「私は誰でしょう」などが混じってても除外
  const lines = raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^私は誰でしょう/.test(s));

  const hints = [];
  for (const line of lines) {
    // 先頭の「・」「-」「*」などを除去
    const t = line.replace(/^[・\-\*\u2022]+\s*/, '').trim();
    if (t) hints.push(t);
    if (hints.length >= 5) break;
  }

  // ヒントが1行にも取れない場合は、全文を1ヒント扱いにする保険
  if (hints.length === 0) {
    const t = raw.trim();
    if (t) return [t].slice(0, 5);
  }

  return hints.slice(0, 5);
}

/**
 * 暗記メーカーCSV:
 * questionId,question,answers,wrongChoices,explanation,ordered,generatedWrongChoices
 * 例:
 * id,"私は誰でしょう\n・...\n・...",ギャバン,"","",0,0
 */
function parseAnkimakerWhoisCsv(csvText) {
  const lines = splitCsvLines(csvText || '');
  if (!lines.length) return [];

  const delimiter = detectDelimiter(csvText || '');
  const headerLower = (lines[0] || '').toLowerCase();

  // 先頭行が header っぽければ1行スキップ
  const hasHeader =
    headerLower.includes('questionid') &&
    headerLower.includes('question') &&
    headerLower.includes('answers');

  const start = hasHeader ? 1 : 0;

  const out = [];
  for (let i = start; i < lines.length; i++) {
    const cells = parseDelimitedLine(lines[i], delimiter);
    while (cells.length < 7) cells.push('');

    const [questionId, question, answers, wrongChoices, explanation] = cells;

    const answer = String(answers ?? '').trim();
    const hints = extractHintsFromQuestionCell(question);

    if (!answer || hints.length === 0) continue;

    out.push({
      questionId: String(questionId ?? '').trim(),
      answer,
      hints,
      explanation: String(explanation ?? '').trim(),
    });
  }
  return out;
}

export default function WhoIsSubmitPage() {
  // フォーム
  const [answer, setAnswer] = useState('');
  const [altAnswers, setAltAnswers] = useState(['']);
  const [hints, setHints] = useState(['']); // 1〜5
  const [explanation, setExplanation] = useState('');

  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // CSV読み込みストック
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importQueue, setImportQueue] = useState([]);
  const [importIndex, setImportIndex] = useState(0);
  const [importInfo, setImportInfo] = useState('');

  // まだ作られてないキャラ表示
  const [missingOpen, setMissingOpen] = useState(false);
  const [missingLoading, setMissingLoading] = useState(false);
  const [missingError, setMissingError] = useState('');
  const [missingQuery, setMissingQuery] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [charsInfo, setCharsInfo] = useState(null); // {total, missing, list}

  const applyImported = (item) => {
    if (!item) return;
    setAnswer(item.answer || '');
    setAltAnswers(['']);
    const hs = Array.isArray(item.hints) ? item.hints.slice(0, 5) : [];
    setHints(hs.length ? hs : ['']);
    setExplanation(item.explanation || '');
  };

  const addHintRow = () => {
    setHints((prev) => {
      if (prev.length >= 5) return prev;
      return [...prev, ''];
    });
  };
  const removeHintRow = (i) => {
    setHints((prev) => {
      if (prev.length <= 1) return prev;
      const copy = [...prev];
      copy.splice(i, 1);
      return copy;
    });
  };

  const addAltRow = () => setAltAnswers((p) => [...p, '']);
  const removeAltRow = (i) => {
    setAltAnswers((prev) => {
      if (prev.length <= 1) return prev;
      const copy = [...prev];
      copy.splice(i, 1);
      return copy;
    });
  };

  const handleImportAdd = () => {
    const list = parseAnkimakerWhoisCsv(importText || '');
    if (!list.length) {
      setImportInfo('読み込める問題がありませんでした。');
      return;
    }
    setImportQueue((prev) => {
      const next = [...prev, ...list];
      setImportInfo(`${list.length}問をストックに追加しました。（合計 ${next.length}問）`);
      return next;
    });
  };

  const handleImportNext = () => {
    if (importQueue.length === 0) {
      setImportInfo('ストックが空です。CSVを貼り付けて「ストックに追加」を押してください。');
      return;
    }
    if (importIndex >= importQueue.length) {
      setImportInfo('ストックの問題は全てフォームに流し込みました。');
      return;
    }
    const item = importQueue[importIndex];
    applyImported(item);
    const nextIndex = importIndex + 1;
    setImportIndex(nextIndex);
    setImportInfo(`読み込み済み: ${nextIndex} / ${importQueue.length} 問`);
  };

  const handleImportPrev = () => {
    if (importQueue.length === 0) {
      setImportInfo('ストックが空です。');
      return;
    }
    const prevIndex = Math.max(1, importIndex) - 1;
    const item = importQueue[Math.max(0, prevIndex - 1)];
    applyImported(item);
    setImportIndex(Math.max(1, prevIndex));
    setImportInfo(`読み込み済み: ${Math.max(1, prevIndex)} / ${importQueue.length} 問`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setMessage('');

    const a = String(answer || '').trim();
    const hs = cleanArray(hints).slice(0, 5);
    const alts = cleanArray(altAnswers);

    if (!a) {
      setMessage('答えを入力してください。');
      return;
    }
    if (hs.length < 1) {
      setMessage('ヒントは最低1つ必要です。');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/whois/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer: a,
          altAnswers: alts,
          hints: hs,
          explanation: String(explanation || '').trim(),
          questionId: importQueue[importIndex - 1]?.questionId || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setMessage(data.error || '送信に失敗しました。');
        return;
      }

      setMessage('送信しました。承認されると本番に反映されます。');

      // 次のCSVを自動セット（ストックがあれば）
      if (importQueue.length > 0 && importIndex < importQueue.length) {
        const nextItem = importQueue[importIndex];
        applyImported(nextItem);
        const nextIndex = importIndex + 1;
        setImportIndex(nextIndex);
        setImportInfo(`読み込み済み: ${nextIndex} / ${importQueue.length} 問`);
      } else {
        // 通常時は軽くリセット
        setAnswer('');
        setAltAnswers(['']);
        setHints(['']);
        setExplanation('');
      }
    } catch (err) {
      console.error(err);
      setMessage('送信中にエラーが発生しました。');
    } finally {
      setSubmitting(false);
    }
  };

  const loadMissing = async () => {
    try {
      setMissingLoading(true);
      setMissingError('');
      const qs = new URLSearchParams();
      if (missingQuery) qs.set('q', missingQuery);
      if (onlyMissing) qs.set('onlyMissing', '1');

      const res = await fetch(`/api/whois/missing-characters?${qs.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || '取得に失敗しました');

      setCharsInfo(data);
    } catch (e) {
      console.error(e);
      setMissingError(e.message || '取得に失敗しました');
    } finally {
      setMissingLoading(false);
    }
  };

  // missing を開いたら読み込む
  useEffect(() => {
    if (!missingOpen) return;
    loadMissing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingOpen]);

  const filteredList = useMemo(() => {
    const list = charsInfo?.list || [];
    // ★ 300件制限を撤廃（全件表示）
    return list;
  }, [charsInfo]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 px-4 py-6">
      <div className="max-w-xl mx-auto space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-bold">私は誰でしょう：投稿</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setImportOpen((v) => !v)}
              className="border border-emerald-400 px-3 py-1 rounded-full text-xs font-bold bg-slate-900 text-emerald-100"
            >
              CSV読み込み
            </button>
            <button
              type="button"
              onClick={() => setMissingOpen((v) => !v)}
              className="border border-sky-400 px-3 py-1 rounded-full text-xs font-bold bg-slate-900 text-sky-100"
            >
              未作成キャラ
            </button>
            <Link
              href="/solo/whois"
              className="border border-slate-400 px-3 py-1 rounded-full text-xs font-bold bg-slate-900 text-slate-100"
            >
              戻る
            </Link>
          </div>
        </header>

        {importOpen && (
          <div className="text-xs bg-slate-900 border border-emerald-500 rounded-2xl px-3 py-3 space-y-2">
            <div className="font-semibold text-emerald-200">暗記メーカーCSVを貼り付け</div>
            <div className="text-[11px] text-slate-400 leading-relaxed">
              対応列：questionId,question,answers,wrongChoices,explanation,ordered,generatedWrongChoices
              <br />
              question内の箇条書きをヒント1〜5に自動分割します（最大5）。
            </div>
            <textarea
              className="w-full h-40 px-2 py-1 rounded bg-slate-950 border border-slate-700 font-mono leading-snug text-[14px]"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="ここにCSVを貼り付け"
            />

            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={handleImportAdd}
                className="px-3 py-1 rounded-full bg-emerald-500 text-black font-bold text-xs"
              >
                ストックに追加
              </button>
              <button
                type="button"
                onClick={handleImportPrev}
                className="px-3 py-1 rounded-full bg-slate-800 text-emerald-100 font-bold text-xs border border-slate-600"
              >
                1つ前
              </button>
              <button
                type="button"
                onClick={handleImportNext}
                className="px-3 py-1 rounded-full bg-emerald-700 text-slate-50 font-bold text-xs"
              >
                次をフォームにセット
              </button>

              <span className="text-[11px] text-slate-400">
                ストック: {importQueue.length} 問 / 次のインデックス: {importIndex + 1}
              </span>
            </div>

            {importInfo && <div className="text-[11px] text-emerald-200 whitespace-pre-line">{importInfo}</div>}
          </div>
        )}

        {missingOpen && (
          <div className="text-xs bg-slate-900 border border-sky-500 rounded-2xl px-3 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sky-200">未作成キャラ一覧（chars.csv 連動）</div>
              {missingLoading && <div className="text-[10px] text-slate-400">読み込み中…</div>}
            </div>

            {missingError && <div className="text-[11px] text-rose-300">{missingError}</div>}

            {charsInfo && (
              <div className="text-[11px] text-slate-300">
                総数: {charsInfo.total} / 未作成: {charsInfo.missing}
              </div>
            )}

            <div className="flex gap-2 items-center">
              <input
                className="flex-1 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-slate-50"
                placeholder="名前 or char_no で検索"
                value={missingQuery}
                onChange={(e) => setMissingQuery(e.target.value)}
              />
              <button
                type="button"
                onClick={loadMissing}
                className="px-3 py-1 rounded bg-sky-600 text-xs text-white"
              >
                🔍
              </button>
            </div>

            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="accent-sky-400"
                checked={onlyMissing}
                onChange={() => setOnlyMissing((v) => !v)}
              />
              <span className="text-[11px] text-sky-100">未作成のみ表示</span>
            </label>

            <div className="max-h-64 overflow-y-auto border border-slate-800 rounded-xl">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-slate-950 text-slate-300">
                    <th className="p-2 text-left w-16">No</th>
                    <th className="p-2 text-left">name</th>
                    <th className="p-2 text-right w-20">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((c) => (
                    <tr key={c.char_no} className="border-t border-slate-800">
                      <td className="p-2">{c.char_no}</td>
                      <td className="p-2">{c.name}</td>
                      <td className="p-2 text-right">
                        {c.exists ? (
                          <span className="text-emerald-300">作成済</span>
                        ) : (
                          <span className="text-rose-300">未作成</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredList.length === 0 && (
                    <tr>
                      <td className="p-2 text-slate-400" colSpan={3}>
                        該当なし
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-[10px] text-slate-500">
              ※全件表示します。重い場合は検索で絞ってね。
            </div>
          </div>
        )}

        {/* フォーム */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1 text-sm">
            <label className="block font-semibold">
              答え（キャラ名） <span className="text-rose-400">必須</span>
            </label>
            <input
              className="w-full px-2 py-2 rounded bg-slate-900 border border-slate-600 text-[16px]"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="例：ゴール・D・ロジャー"
            />
          </div>

          <div className="space-y-1 text-sm">
            <label className="block font-semibold">別解（完全一致）※任意</label>
            {altAnswers.map((v, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="flex-1 px-2 py-2 rounded bg-slate-900 border border-slate-600 text-[16px]"
                  value={v}
                  onChange={(e) => {
                    const value = e.target.value;
                    setAltAnswers((prev) => {
                      const copy = [...prev];
                      copy[i] = value;
                      return copy;
                    });
                  }}
                />
                <button
                  type="button"
                  className="px-2 text-xs bg-slate-700 rounded"
                  onClick={() => removeAltRow(i)}
                >
                  －
                </button>
              </div>
            ))}
            <button type="button" className="mt-1 px-2 py-1 text-xs bg-slate-700 rounded" onClick={addAltRow}>
              ＋ 追加
            </button>
          </div>

          <div className="space-y-1 text-sm">
            <label className="block font-semibold">
              ヒント（1〜5） <span className="text-rose-400">必須</span>
            </label>
            {hints.map((v, i) => (
              <div key={i} className="flex gap-2">
                <textarea
                  className="flex-1 px-2 py-2 rounded bg-slate-900 border border-slate-600 text-[16px]"
                  rows={2}
                  value={v}
                  onChange={(e) => {
                    const value = e.target.value;
                    setHints((prev) => {
                      const copy = [...prev];
                      copy[i] = value;
                      return copy;
                    });
                  }}
                  placeholder={`ヒント${i + 1}`}
                />
                <button
                  type="button"
                  className="px-2 text-xs bg-slate-700 rounded"
                  onClick={() => removeHintRow(i)}
                >
                  －
                </button>
              </div>
            ))}

            <button
              type="button"
              className="mt-1 px-2 py-1 text-xs bg-slate-700 rounded disabled:opacity-50"
              onClick={addHintRow}
              disabled={hints.length >= 5}
            >
              ＋ ヒント追加
            </button>
          </div>

          <div className="space-y-1 text-sm">
            <label className="block font-semibold">解説（任意）</label>
            <textarea
              className="w-full h-20 px-2 py-2 rounded bg-slate-900 border border-slate-600 text-[16px]"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
            />
          </div>

          {message && (
            <div className="text-xs bg-slate-900 border border-slate-600 rounded px-3 py-2">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded bg-orange-500 text-black font-bold disabled:opacity-60"
          >
            {submitting ? '送信中…' : 'この内容で投稿する'}
          </button>
        </form>

        <div className="text-center">
          <Link href="/solo/whois" className="underline text-slate-300 text-xs">
            トップに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
