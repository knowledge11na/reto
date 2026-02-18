// file: app/admin/quotes/page.js
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

function clampEpisode(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return String(Math.max(1, Math.min(999999, Math.floor(n))));
}

/** キャラ候補（全キャラCSVから検索） */
function CharSuggest({ value, onPick }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = String(value || '').trim();
    if (!q) {
      setRows([]);
      return;
    }

    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/quotes/chars?q=${encodeURIComponent(q)}&limit=50`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) throw new Error(data?.message || 'failed');
        setRows(data?.rows || []);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(t);
  }, [value]);

  if (!String(value || '').trim()) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
      <div className="text-[11px] text-slate-600 mb-2">
        {loading ? '検索中…' : rows.length ? '候補（クリックで入力）' : '候補なし'}
      </div>

      {rows.length > 0 && (
        <div className="max-h-48 overflow-auto space-y-1">
          {rows.map((r) => (
            <button
              key={`${r.char_no}-${r.name}`}
              type="button"
              onClick={() => onPick(r.name)}
              className="w-full text-left px-2 py-1 rounded-lg hover:bg-white border border-transparent hover:border-slate-200"
            >
              <span className="text-xs font-bold text-slate-800 mr-2">#{r.char_no}</span>
              <span className="text-sm text-slate-900">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminQuotesPage() {
  // 折りたたみ
  const [openAdd, setOpenAdd] = useState(true);
  const [openEpisodeList, setOpenEpisodeList] = useState(true);

  // 追加フォーム
  const [episode, setEpisode] = useState('1');

  // ★複数話者（複数人で同じセリフ）
  const [speakers, setSpeakers] = useState(['']); // 1人目（先頭）が代表（character_name）
  const [quoteText, setQuoteText] = useState('');

  // 表示（今の話数のセリフ一覧）
  const [episodeRows, setEpisodeRows] = useState([]);
  const [episodeLoading, setEpisodeLoading] = useState(false);

  // 編集
  const [editId, setEditId] = useState(null);
  const [editSpeakers, setEditSpeakers] = useState(['']);
  const [editText, setEditText] = useState('');

  // 挿入（間に刺す）
  const [insertAfterId, setInsertAfterId] = useState(null); // null=先頭に挿入（フォーム表示にも使う）
  const [insertSpeakers, setInsertSpeakers] = useState(['']);
  const [insertText, setInsertText] = useState('');

  // 検索
  const [searchEpisode, setSearchEpisode] = useState('');
  const [searchChar, setSearchChar] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchRows, setSearchRows] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [msg, setMsg] = useState('');

  const primarySpeaker = useMemo(() => String(speakers?.[0] || ''), [speakers]);
  const episodeCharOptions = useMemo(() => {
    const set = new Set();
    for (const r of episodeRows || []) {
      // speaker_names が配列で返る時もあれば、null の時もある想定
      const arr = Array.isArray(r?.speaker_names) ? r.speaker_names : null;
      if (arr && arr.length) {
        for (const n of arr) {
          const t = String(n || '').trim();
          if (t) set.add(t);
        }
      } else {
        const n = String(r?.character_name || '').trim();
        if (n) set.add(n);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [episodeRows]);

  const loadEpisodeRows = async (ep) => {
    const ep2 = clampEpisode(ep);
    if (!ep2) return;
    setEpisodeLoading(true);
    try {
      const res = await fetch(`/api/admin/quotes?episode=${encodeURIComponent(ep2)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.message || '取得失敗');
      setEpisodeRows(data?.rows || []);
    } catch (e) {
      console.error(e);
      setEpisodeRows([]);
    } finally {
      setEpisodeLoading(false);
    }
  };

  useEffect(() => {
    loadEpisodeRows('1');
  }, []);

  const normalizeSpeakers = (arr) => {
    const cleaned = (Array.isArray(arr) ? arr : [])
      .map((x) => String(x ?? '').trim())
      .filter(Boolean);

    const seen = new Set();
    const uniq = [];
    for (const n of cleaned) {
      if (seen.has(n)) continue;
      seen.add(n);
      uniq.push(n);
    }
    return uniq.length ? uniq : [''];
  };

  // ===== 追加（末尾） =====
  const handleAddQuote = async () => {
    setMsg('');
    const ep = clampEpisode(episode);
    const text = String(quoteText || '').trim();
    const sp = normalizeSpeakers(speakers);

    if (!ep) return setMsg('話数が不正です。');
    if (!sp[0]) return setMsg('キャラ名を入力してください（最低1人）。');
    if (!text) return setMsg('セリフを入力してください。');

    try {
      const res = await fetch('/api/admin/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episode: Number(ep),
          character_id: null,
          character_name: sp[0], // 互換：代表
          speaker_names: sp, // ★複数
          quote_text: text,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.message || '追加失敗');

      setQuoteText('');
      setSpeakers(['']);
      await loadEpisodeRows(ep);
      setMsg('追加しました。');
      setOpenEpisodeList(true);
    } catch (e) {
      console.error(e);
      setMsg(`追加に失敗しました：${e?.message || 'error'}`);
    }
  };

  // ===== 挿入（間に刺す） =====
  const openInsert = (afterIdOrNull) => {
    setInsertAfterId(afterIdOrNull ?? null);
    setInsertSpeakers(normalizeSpeakers([primarySpeaker || '']));
    setInsertText('');
    setOpenAdd(true);
    setOpenEpisodeList(true);
  };

  const cancelInsert = () => {
    setInsertAfterId(null);
    setInsertSpeakers(['']);
    setInsertText('');
  };

  const handleInsert = async () => {
    setMsg('');
    const ep = clampEpisode(episode);
    const text = String(insertText || '').trim();
    const sp = normalizeSpeakers(insertSpeakers);

    if (!ep) return setMsg('話数が不正です。');
    if (!sp[0]) return setMsg('キャラ名を入力してください（最低1人）。');
    if (!text) return setMsg('セリフを入力してください。');

    try {
      const res = await fetch('/api/admin/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episode: Number(ep),
          character_id: null,
          character_name: sp[0],
          speaker_names: sp,
          quote_text: text,
          insert_after_id: insertAfterId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.message || '挿入失敗');

      cancelInsert();
      await loadEpisodeRows(ep);
      setMsg('挿入しました。');
    } catch (e) {
      console.error(e);
      setMsg(`挿入に失敗しました：${e?.message || 'error'}`);
    }
  };

  // ===== 編集 =====
  const speakersFromRow = (row) => {
    const arr = Array.isArray(row?.speaker_names) ? row.speaker_names : null;
    if (arr && arr.length) return normalizeSpeakers(arr);
    const n = String(row?.character_name || '').trim();
    return normalizeSpeakers([n]);
  };

  const startEdit = (row) => {
    setEditId(row?.id ?? null);
    setEditSpeakers(speakersFromRow(row));
    setEditText(String(row?.quote_text || ''));
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditSpeakers(['']);
    setEditText('');
  };

  const saveEdit = async () => {
    setMsg('');
    const id = Number(editId);
    const text = String(editText || '').trim();
    const sp = normalizeSpeakers(editSpeakers);

    if (!Number.isFinite(id) || id <= 0) return setMsg('編集対象が不正です。');
    if (!sp[0]) return setMsg('キャラ名は空にできません（最低1人）。');
    if (!text) return setMsg('セリフは空にできません。');

    try {
      const res = await fetch('/api/admin/quotes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          character_name: sp[0],
          speaker_names: sp,
          quote_text: text,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.message || '編集失敗');

      cancelEdit();
      await loadEpisodeRows(episode);
      if (searchRows?.length) await handleSearch(true);

      setMsg('編集しました。');
    } catch (e) {
      console.error(e);
      setMsg(`編集に失敗しました：${e?.message || 'error'}`);
    }
  };

  // ===== 削除 =====
  const handleDelete = async (id) => {
    const ok = window.confirm('このセリフを削除しますか？');
    if (!ok) return;
    setMsg('');
    try {
      const res = await fetch(`/api/admin/quotes?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.message || '削除失敗');

      await loadEpisodeRows(episode);
      if (searchRows?.length) await handleSearch(true);

      setMsg('削除しました。');
    } catch (e) {
      console.error(e);
      setMsg(`削除に失敗しました：${e?.message || 'error'}`);
    }
  };

  // ===== 検索 =====
  const handleSearch = async (silent = false) => {
    if (!silent) setMsg('');
    setSearchLoading(true);
    try {
      const params = new URLSearchParams();
      const ep = clampEpisode(searchEpisode);
      const ch = String(searchChar || '').trim();
      const qt = String(searchText || '').trim();

      if (ep) params.set('episode', ep);
      if (ch) params.set('char', ch);
      if (qt) params.set('q', qt);

      const qs = params.toString();
      const res = await fetch(`/api/admin/quotes${qs ? `?${qs}` : ''}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.message || '検索失敗');
      setSearchRows(data?.rows || []);
    } catch (e) {
      console.error(e);
      setSearchRows([]);
      if (!silent) setMsg(`検索に失敗しました：${e?.message || 'error'}`);
    } finally {
      setSearchLoading(false);
    }
  };

  const groupedSearch = useMemo(() => {
    const map = new Map();
    for (const r of searchRows || []) {
      const ep = r?.episode ?? 0;
      if (!map.has(ep)) map.set(ep, []);
      map.get(ep).push(r);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort(
        (a, b) =>
          (a?.sort_index ?? 0) - (b?.sort_index ?? 0) ||
          (a?.id ?? 0) - (b?.id ?? 0)
      );
      map.set(k, arr);
    }
    const eps = Array.from(map.keys()).sort((a, b) => a - b);
    return eps.map((ep) => ({ episode: ep, rows: map.get(ep) }));
  }, [searchRows]);

  const speakerLabel = (r) => {
    const arr = Array.isArray(r?.speaker_names) ? r.speaker_names : null;
    if (arr && arr.length) return arr.join(' / ');
    return String(r?.character_name || '');
  };

  const SectionHeader = ({ title, open, onToggle, right }) => (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200"
      >
        <span className="text-sm font-extrabold text-slate-900">{title}</span>
        <span className="text-xs text-slate-600">{open ? '▲' : '▼'}</span>
      </button>
      {right ? <div className="text-xs text-slate-600">{right}</div> : null}
    </div>
  );

  return (
    <main className="min-h-screen bg-sky-50 text-slate-900 p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold">💬 セリフ管理</h1>
            <p className="text-xs text-slate-700 mt-1">
              話数・キャラ（複数可）・セリフを保存し、話数/キャラ/セリフで検索できます。各行は編集可能で、行と行の間に挿入もできます。
            </p>
          </div>
          <Link
            href="/admin"
            className="px-3 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-sm font-bold"
          >
            ← 管理トップ
          </Link>
        </header>

        {/* 追加フォーム（折りたたみ） */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-5 space-y-3">
          <SectionHeader
            title="追加"
            open={openAdd}
            onToggle={() => setOpenAdd((v) => !v)}
          />

          {openAdd && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="space-y-1">
                  <div className="text-xs font-bold text-slate-700">話数</div>
                  <input
                    value={episode}
                    onChange={(e) => setEpisode(clampEpisode(e.target.value))}
                    onBlur={() => loadEpisodeRows(episode)}
                    inputMode="numeric"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-900"
                    placeholder="例：1"
                  />
                </label>

                <div className="space-y-2 md:col-span-2">
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-2">
                    キャラ（複数人OK）
                    {episodeCharOptions.length > 0 && (
                      <span className="text-[11px] text-slate-500">
                        この話の登場キャラから選択も可能
                      </span>
                    )}
                  </div>

                  {/* speakers 入力群 */}
                  <div className="space-y-2">
                    {speakers.map((v, i) => (
                      <div key={i} className="flex flex-wrap gap-2 items-center">
                        <div className="text-[11px] text-slate-600 w-[70px]">
                          {i === 0 ? '代表' : `追加${i}`}
                        </div>

                        <input
                          value={v}
                          onChange={(e) => {
                            const next = [...speakers];
                            next[i] = e.target.value;
                            setSpeakers(next);
                          }}
                          className="flex-1 min-w-[220px] rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-900"
                          placeholder={i === 0 ? '例：ルフィ' : '例：シャンクス'}
                        />

                        <select
                          value=""
                          onChange={(e) => {
                            const pick = e.target.value;
                            if (!pick) return;
                            const next = [...speakers];
                            next[i] = pick;
                            setSpeakers(next);
                            e.target.value = '';
                          }}
                          className="rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-900 text-sm"
                        >
                          <option value="">（この話のキャラ）</option>
                          {episodeCharOptions.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => {
                            const next = speakers.filter((_, idx) => idx !== i);
                            setSpeakers(next.length ? next : ['']);
                          }}
                          className="px-2 py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-xs font-bold"
                        >
                          削除
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2 items-center">
                    <button
                      type="button"
                      onClick={() => setSpeakers((prev) => [...prev, ''])}
                      className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold"
                    >
                      ＋複数人追加
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        fetch('/api/admin/quotes/chars', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ name: String(primarySpeaker || '').trim() }),
                        })
                          .then((r) => r.json().catch(() => ({})).then((d) => ({ ok: r.ok, d })))
                          .then(({ ok, d }) => {
                            if (!ok || d?.ok === false) throw new Error(d?.message || '追加失敗');
                            setMsg(d?.existed ? '既にキャラが存在しました。' : 'キャラを追加しました。');
                          })
                          .catch((e) => {
                            console.error(e);
                            setMsg(`キャラ追加に失敗しました：${e?.message || 'error'}`);
                          });
                      }}
                      className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-sm font-bold"
                    >
                      ＋代表キャラをキャラ表に追加
                    </button>
                  </div>

                  {/* 代表キャラのサジェストだけ表示（使い勝手優先） */}
                  <CharSuggest
                    value={primarySpeaker}
                    onPick={(name) => {
                      const next = [...speakers];
                      next[0] = name;
                      setSpeakers(next);
                    }}
                  />

                  <div className="text-[11px] text-slate-600">
                    代表キャラは必須。検索候補は代表欄の入力に反応します（必要なら後で全欄対応にもできます）。
                  </div>
                </div>
              </div>

              <label className="space-y-1">
                <div className="text-xs font-bold text-slate-700">セリフ</div>
                <textarea
                  value={quoteText}
                  onChange={(e) => setQuoteText(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-900 min-h-[96px]"
                  placeholder="例：海賊王におれはなる"
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddQuote}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-extrabold"
                >
                  末尾に追加して保存
                </button>

                <button
                  type="button"
                  onClick={() => openInsert(null)}
                  className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold"
                >
                  先頭に挿入
                </button>

                <button
                  type="button"
                  onClick={() => loadEpisodeRows(episode)}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-sm font-bold"
                >
                  この話数を再読み込み
                </button>

                {msg && <span className="text-xs text-slate-700">{msg}</span>}
              </div>

              {/* 挿入フォーム（先頭 or 行の間） */}
              {insertAfterId !== null && (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3 space-y-2">
                  <div className="text-sm font-extrabold text-indigo-900">
                    {insertAfterId ? 'この行の次に挿入' : '先頭に挿入'}
                  </div>

                  <div className="space-y-2">
                    {insertSpeakers.map((v, i) => (
                      <div key={i} className="flex flex-wrap gap-2 items-center">
                        <div className="text-[11px] text-slate-600 w-[70px]">
                          {i === 0 ? '代表' : `追加${i}`}
                        </div>

                        <input
                          value={v}
                          onChange={(e) => {
                            const next = [...insertSpeakers];
                            next[i] = e.target.value;
                            setInsertSpeakers(next);
                          }}
                          className="flex-1 min-w-[220px] rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-900"
                          placeholder={i === 0 ? '例：シャンクス' : '例：ルフィ'}
                        />

                        <select
                          value=""
                          onChange={(e) => {
                            const pick = e.target.value;
                            if (!pick) return;
                            const next = [...insertSpeakers];
                            next[i] = pick;
                            setInsertSpeakers(next);
                            e.target.value = '';
                          }}
                          className="rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-900 text-sm"
                        >
                          <option value="">（この話のキャラ）</option>
                          {episodeCharOptions.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => {
                            const next = insertSpeakers.filter((_, idx) => idx !== i);
                            setInsertSpeakers(next.length ? next : ['']);
                          }}
                          className="px-2 py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-xs font-bold"
                        >
                          削除
                        </button>
                      </div>
                    ))}

                    <div className="flex flex-wrap gap-2 items-center">
                      <button
                        type="button"
                        onClick={() => setInsertSpeakers((prev) => [...prev, ''])}
                        className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold"
                      >
                        ＋複数人追加
                      </button>
                    </div>
                  </div>

                  <label className="space-y-1">
                    <div className="text-xs font-bold text-slate-700">セリフ</div>
                    <input
                      value={insertText}
                      onChange={(e) => setInsertText(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-900"
                      placeholder="例：そうか"
                    />
                  </label>

                  <div className="flex flex-wrap gap-2 items-center">
                    <button
                      type="button"
                      onClick={handleInsert}
                      className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-extrabold"
                    >
                      挿入して保存
                    </button>
                    <button
                      type="button"
                      onClick={cancelInsert}
                      className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-sm font-bold"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* この話数の一覧（折りたたみ） */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-5 space-y-3">
          <SectionHeader
            title="この話数のセリフ（保存順）"
            open={openEpisodeList}
            onToggle={() => setOpenEpisodeList((v) => !v)}
            right={episodeLoading ? '読み込み中…' : `${episodeRows?.length ?? 0} 件`}
          />

          {openEpisodeList && (
            <div className="overflow-x-auto">
              <table className="min-w-[780px] w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-600">
                    <th className="py-2 pr-3 w-[90px]">話数</th>
                    <th className="py-2 pr-3 w-[260px]">キャラ</th>
                    <th className="py-2 pr-3">セリフ</th>
                    <th className="py-2 pr-3 w-[240px]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 先頭に挿入ボタン */}
                  <tr className="border-t border-slate-100">
                    <td colSpan={4} className="py-2">
                      <button
                        type="button"
                        onClick={() => openInsert(null)}
                        className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                      >
                        ＋ ここに挿入（先頭）
                      </button>
                    </td>
                  </tr>

                  {(episodeRows || []).map((r, idx) => {
                    const isEditing = Number(editId) === Number(r.id);

                    return (
                      <tr key={r.id} className="border-t border-slate-100 align-top">
                        <td className="py-2 pr-3 font-bold text-slate-800">
                          {idx === 0 ? `${r.episode}話` : ''}
                        </td>

                        <td className="py-2 pr-3 font-bold text-slate-900">
                          {isEditing ? (
                            <div className="space-y-2">
                              {editSpeakers.map((v, i) => (
                                <div key={i} className="flex gap-2 items-center">
                                  <input
                                    value={v}
                                    onChange={(e) => {
                                      const next = [...editSpeakers];
                                      next[i] = e.target.value;
                                      setEditSpeakers(next);
                                    }}
                                    className="flex-1 rounded-lg border border-slate-300 px-2 py-1 bg-white text-slate-900"
                                    placeholder={i === 0 ? '代表' : '追加'}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = editSpeakers.filter((_, idx2) => idx2 !== i);
                                      setEditSpeakers(next.length ? next : ['']);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-xs font-bold"
                                  >
                                    削除
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => setEditSpeakers((prev) => [...prev, ''])}
                                className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
                              >
                                ＋複数人
                              </button>
                            </div>
                          ) : (
                            speakerLabel(r)
                          )}
                        </td>

                        <td className="py-2 pr-3 text-slate-900 whitespace-pre-wrap">
                          {isEditing ? (
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-2 py-1 bg-white text-slate-900 min-h-[64px]"
                            />
                          ) : (
                            r.quote_text
                          )}
                        </td>

                        <td className="py-2 pr-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openInsert(r.id)}
                              className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                            >
                              ＋次に挿入
                            </button>

                            {!isEditing ? (
                              <button
                                type="button"
                                onClick={() => startEdit(r)}
                                className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                              >
                                編集
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={saveEdit}
                                  className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                                >
                                  保存
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  className="px-2 py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-xs font-bold"
                                >
                                  キャンセル
                                </button>
                              </>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDelete(r.id)}
                              className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                            >
                              削除
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {(!episodeRows || episodeRows.length === 0) && (
                    <tr>
                      <td colSpan={4} className="py-4 text-slate-600 text-sm">
                        まだセリフがありません。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 検索（そのまま） */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold">検索</h2>
            <div className="text-xs text-slate-600">{searchLoading ? '検索中…' : ''}</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="space-y-1">
              <div className="text-xs font-bold text-slate-700">話数（空なら全話）</div>
              <input
                value={searchEpisode}
                onChange={(e) => setSearchEpisode(clampEpisode(e.target.value))}
                inputMode="numeric"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-900"
                placeholder="例：1"
              />
            </label>
            <label className="space-y-1">
              <div className="text-xs font-bold text-slate-700">キャラ名（部分一致）</div>
              <input
                value={searchChar}
                onChange={(e) => setSearchChar(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-900"
                placeholder="例：ルフィ"
              />
            </label>
            <label className="space-y-1">
              <div className="text-xs font-bold text-slate-700">セリフ（部分一致）</div>
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-900"
                placeholder="例：海賊王"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSearch(false)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-extrabold"
            >
              検索
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchEpisode('');
                setSearchChar('');
                setSearchText('');
                setSearchRows([]);
              }}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-sm font-bold"
            >
              クリア
            </button>
          </div>

          <div className="space-y-4">
            {(groupedSearch || []).map((g) => (
              <div key={g.episode} className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 font-extrabold">
                  {g.episode}話（{g.rows.length}件）
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-[760px] w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-600">
                        <th className="py-2 pr-3 w-[260px] px-3">キャラ</th>
                        <th className="py-2 pr-3">セリフ</th>
                        <th className="py-2 pr-3 w-[220px]">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r) => {
                        const isEditing = Number(editId) === Number(r.id);
                        return (
                          <tr key={r.id} className="border-t border-slate-100 align-top">
                            <td className="py-2 pr-3 px-3 font-bold text-slate-900">
                              {isEditing ? (
                                <div className="space-y-2">
                                  {editSpeakers.map((v, i) => (
                                    <div key={i} className="flex gap-2 items-center">
                                      <input
                                        value={v}
                                        onChange={(e) => {
                                          const next = [...editSpeakers];
                                          next[i] = e.target.value;
                                          setEditSpeakers(next);
                                        }}
                                        className="flex-1 rounded-lg border border-slate-300 px-2 py-1 bg-white text-slate-900"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const next = editSpeakers.filter((_, idx2) => idx2 !== i);
                                          setEditSpeakers(next.length ? next : ['']);
                                        }}
                                        className="px-2 py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-xs font-bold"
                                      >
                                        削除
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => setEditSpeakers((prev) => [...prev, ''])}
                                    className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
                                  >
                                    ＋複数人
                                  </button>
                                </div>
                              ) : (
                                speakerLabel(r)
                              )}
                            </td>
                            <td className="py-2 pr-3 text-slate-900 whitespace-pre-wrap">
                              {isEditing ? (
                                <textarea
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  className="w-full rounded-lg border border-slate-300 px-2 py-1 bg-white text-slate-900 min-h-[64px]"
                                />
                              ) : (
                                r.quote_text
                              )}
                            </td>
                            <td className="py-2 pr-3">
                              <div className="flex flex-wrap gap-2">
                                {!isEditing ? (
                                  <button
                                    type="button"
                                    onClick={() => startEdit(r)}
                                    className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                                  >
                                    編集
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={saveEdit}
                                      className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                                    >
                                      保存
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEdit}
                                      className="px-2 py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-xs font-bold"
                                    >
                                      キャンセル
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDelete(r.id)}
                                  className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                                >
                                  削除
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {searchRows && searchRows.length === 0 && (
              <div className="text-sm text-slate-600">検索結果はここに表示されます。</div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
