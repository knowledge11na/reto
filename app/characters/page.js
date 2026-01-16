// file: app/characters/page.js
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/* ============================================================
   ★ 枠（★1〜5）はガチャ演出の card-r1〜card-r5 を完全再現
   ★6〜11 は虹枠 + 背景（銅/銀/金/プラチナ/ダイヤ）を完全再現
============================================================ */

// ★テキスト＆フォント（ガチャ演出と完全一致）
function getStarVisual(starsRaw) {
  const s = Math.max(1, Math.min(starsRaw ?? 1, 11));
  const stars = '★'.repeat(s);

  let sizeClass = 'text-base tracking-[0.2em]';
  if (s >= 6 && s <= 8) sizeClass = 'text-[13px] tracking-[0.16em]';
  if (s >= 9) sizeClass = 'text-[11px] tracking-[0.12em]';

  return { s, stars, sizeClass };
}

// ★1〜5 の枠（ガチャの card-r1〜5）
function getNormalCardClass(stars, selected) {
  const base =
    'relative rounded-3xl px-4 py-3 flex flex-col justify-between ' +
    'border-4 bg-white shadow-md transition-transform cursor-pointer ' +
    'hover:-translate-y-[1px]';

  const sel = selected
    ? ' ring-2 ring-sky-400 ring-offset-2 ring-offset-sky-50'
    : '';

  if (stars === 1)
    return (
      base +
      ' border-[#9e9e9e] bg-gradient-to-b from-[#ffffff] to-[#f5f5f5] ' +
      'shadow-[0_6px_14px_rgba(0,0,0,0.45)]' +
      sel
    );

  if (stars === 2)
    return (
      base +
      ' border-[#4caf50] bg-gradient-to-b from-[#ffffff] to-[#f5fff7] ' +
      'shadow-[0_7px_16px_rgba(0,0,0,0.48)]' +
      sel
    );

  if (stars === 3)
    return (
      base +
      ' border-[#e53935] bg-gradient-to-b from-[#ffffff] to-[#ffecec] ' +
      'shadow-[0_7px_18px_rgba(0,0,0,0.5)]' +
      sel
    );

  if (stars === 4)
    return (
      base +
      ' border-[#d8d8d8] bg-gradient-to-b from-[#ffffff] to-[#f7f7ff] ' +
      'shadow-[0_0_14px_rgba(255,255,255,0.9),0_0_26px_rgba(210,210,255,0.8),0_8px_20px_rgba(0,0,0,0.65)]' +
      sel
    );

  if (stars === 5)
    return (
      base +
      ' border-[#ffeb77] bg-gradient-to-b from-[#ffffff] to-[#fff3c0] ' +
      'shadow-[0_0_18px_rgba(255,230,150,1),0_0_32px_rgba(255,210,120,0.9),0_10px_24px_rgba(0,0,0,0.8)]' +
      sel
    );

  return base + sel;
}

// ★6〜11 の背景カラー（ガチャと完全一致）
function getRainbowInnerBg(stars) {
  if (stars === 6) return 'linear-gradient(#ffffff, #faf7ff)';
  if (stars === 7) return 'linear-gradient(135deg, #5a3214, #b97b3c)';
  if (stars === 8) return 'linear-gradient(135deg, #f5f5f5, #c0c2c7)';
  if (stars === 9) return 'linear-gradient(135deg, #fff7c8, #ffc93c)';
  if (stars === 10) return 'linear-gradient(135deg, #f7fbff, #d3ddff)';
  if (stars === 11)
    return 'radial-gradient(circle at 20% 0%, #ffffff, #e0ffff 40%, #ffe6ff 80%, #d0f7ff 100%)';
  return '';
}

// API からのオブジェクト → 星数/元レア度の共通取り出し
function getStarsValue(ch) {
  return ch.stars ?? ch.star ?? 1;
}
function getBaseRarity(ch) {
  return ch.base_rarity ?? ch.rarity ?? 1;
}

/* ============================================================
   ページ本体
============================================================ */
export default function CharactersPage() {
  const [user, setUser] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [teamIds, setTeamIds] = useState([]); // [character_id,...]

  // acquired | rarity | no | no_related
  const [sortMode, setSortMode] = useState('acquired');

  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingData, setLoadingData] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // ★関連問題表示
  const [relOpen, setRelOpen] = useState(false);
  const [relLoading, setRelLoading] = useState(false);
  const [relError, setRelError] = useState('');
  const [relChar, setRelChar] = useState(null);
  const [relQs, setRelQs] = useState([]);

  /* ------------------------------
     ログインユーザー取得
  ------------------------------ */
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/me');
        const j = await r.json();
        setUser(j.user ?? null);
      } catch {
        setUser(null);
      } finally {
        setLoadingUser(false);
      }
    };
    load();
  }, []);

  /* ------------------------------
     キャラ & チーム取得
  ------------------------------ */
  useEffect(() => {
    if (!user) {
      setCharacters([]);
      setTeamIds([]);
      setLoadingData(false);
      return;
    }

    const load = async () => {
      try {
        setLoadingData(true);
        setError('');
        setMessage('');

        const uid = user.id;
        const [cR, tR] = await Promise.all([
          fetch(`/api/user/characters?user_id=${uid}`),
          fetch(`/api/user/team?user_id=${uid}`),
        ]);

        const cj = await cR.json();
        const tj = await tR.json();

        setCharacters(cj.characters || []);
        setTeamIds(
          (tj.team || [])
            .filter((t) => t && t.character_id != null)
            .map((t) => Number(t.character_id))
        );
      } catch (e) {
        console.error(e);
        setError('キャラ情報の取得に失敗しました');
      } finally {
        setLoadingData(false);
      }
    };
    load();
  }, [user]);

  /* ------------------------------
     キャラクリック → マイチーム切替
  ------------------------------ */
  const toggleCharacter = (idRaw) => {
    const id = Number(idRaw);
    setError('');
    setMessage('');

    if (teamIds.includes(id)) {
      setTeamIds(teamIds.filter((x) => x !== id));
      return;
    }

    if (teamIds.length >= 5) {
      setError('マイチームは最大5体までです');
      return;
    }

    setTeamIds([...teamIds, id]);
  };

  /* ------------------------------
     ★関連問題を開く（IDを安全に決める）
  ------------------------------ */
  const openRelated = async (ch) => {
    setRelOpen(true);
    setRelLoading(true);
    setRelError('');
    setRelQs([]);
    setRelChar(ch);

    const cidRaw = ch?.character_id ?? ch?.id ?? ch?.char_id ?? null;
    const cid = Number(cidRaw);

    if (!Number.isFinite(cid) || cid <= 0) {
      setRelLoading(false);
      setRelError(
        `invalid_character_id（このキャラのIDが取れません）: character_id=${String(
          ch?.character_id
        )}, id=${String(ch?.id)}, char_no=${String(ch?.char_no)}`
      );
      return;
    }

    try {
      const res = await fetch(`/api/characters/${cid}/related-questions`, {
        cache: 'no-store',
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || '関連問題の取得に失敗しました');
      }

      setRelQs(json.questions || []);
    } catch (e) {
      console.error(e);
      setRelError(e.message || '関連問題の取得に失敗しました');
    } finally {
      setRelLoading(false);
    }
  };

  /* ------------------------------
     マイチーム保存
  ------------------------------ */
  const saveTeam = async () => {
    if (!user) return;
    try {
      setSaving(true);
      setError('');
      setMessage('');

      const numericIds = teamIds
        .map((id) => Number(id))
        .filter((n) => Number.isFinite(n));

      const r = await fetch('/api/user/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: Number(user.id),
          character_ids: numericIds,
        }),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j.error || '保存に失敗しました');

      setMessage('マイチームを保存しました！');
    } catch (e) {
      console.error(e);
      setError(e.message || 'マイチームの保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------
     マイチームリセット
  ------------------------------ */
  const resetTeam = async () => {
    if (!user) return;
    try {
      setSaving(true);
      setError('');
      setMessage('');

      setTeamIds([]);

      const r = await fetch('/api/user/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: Number(user.id),
          character_ids: [],
        }),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'リセットに失敗しました');

      setMessage('マイチームをリセットしました');
    } catch (e) {
      console.error(e);
      setError(e.message || 'マイチームのリセットに失敗しました');
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------
     ソート後の配列
  ------------------------------ */
  const sorted = [...characters].sort((a, b) => {
    if (sortMode === 'rarity') {
      return getStarsValue(b) - getStarsValue(a);
    }
    if (sortMode === 'no' || sortMode === 'no_related') {
      return (a.char_no ?? a.character_id) - (b.char_no ?? b.character_id);
    }
    return a.id - b.id;
  });

  const isSelected = (idRaw) => {
    const id = Number(idRaw);
    return teamIds.includes(id);
  };

  // ★カードクリックの挙動をソートで切り替え
  const onCardClick = (ch) => {
    if (sortMode === 'no_related') {
      openRelated(ch);
      return;
    }
    toggleCharacter(ch.character_id);
  };

  /* ============================================================
     UIレンダリング
  ============================================================ */

  if (loadingUser)
    return (
      <div className="min-h-screen flex items-center justify-center">
        読み込み中…
      </div>
    );
  if (!user) return <div className="p-10">ログインが必要です</div>;

  return (
    <div className="min-h-screen bg-sky-50 text-sky-900 flex flex-col items-center">
      <header className="w-full max-w-md px-4 pt-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-widest">キャラ図鑑</h1>
        <div className="flex gap-2">
          <Link
            href="/mypage"
            className="px-3 py-1 border border-sky-600 rounded-full bg-white"
          >
            マイページへ
          </Link>
          <Link
            href="/"
            className="px-3 py-1 border border-sky-600 rounded-full bg-white"
          >
            ホームへ
          </Link>
        </div>
      </header>

      <main className="w-full max-w-md px-4 pb-10 mt-4 space-y-6">
        {/* -------------------
            マイチーム
        ------------------- */}
        <section className="bg-sky-100 border border-sky-500 p-4 rounded-3xl">
          <h2 className="font-bold text-lg mb-3">マイチーム（最大5体）</h2>

          {error && (
            <div className="bg-red-200 text-red-800 px-3 py-1 rounded mb-2 text-sm">
              {error}
            </div>
          )}
          {message && (
            <div className="bg-green-200 text-green-800 px-3 py-1 rounded mb-2 text-sm">
              {message}
            </div>
          )}

          <div className="grid grid-cols-5 gap-2 mb-3">
            {[0, 1, 2, 3, 4].map((i) => {
              const id = teamIds[i];
              const ch = characters.find(
                (x) => Number(x.character_id) === Number(id)
              );

              return (
                <div
                  key={i}
                  className="rounded-xl border bg-white text-center px-1 py-2 text-[11px]"
                >
                  <div className="text-sky-600 mb-1">SLOT {i + 1}</div>
                  {ch ? (
                    <>
                      <div className="font-bold line-clamp-2">{ch.name}</div>
                      <div className="text-slate-600">
                        R{getBaseRarity(ch)} / ★{getStarsValue(ch)}
                      </div>
                    </>
                  ) : (
                    <div className="text-slate-500">未設定</div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 mt-2">
            <button
              onClick={saveTeam}
              disabled={saving || teamIds.length === 0}
              className={`flex-1 py-2 rounded-full text-white font-bold ${
                saving || teamIds.length === 0
                  ? 'bg-sky-300'
                  : 'bg-sky-600 hover:brightness-110'
              }`}
            >
              {saving ? '保存中…' : 'この編成で保存する'}
            </button>

            <button
              type="button"
              onClick={resetTeam}
              disabled={saving}
              className="px-4 py-2 rounded-full border border-slate-400 bg-white text-xs font-bold text-slate-700"
            >
              編成リセット
            </button>
          </div>
        </section>

        {/* -------------------
            所持キャラ + ソート
        ------------------- */}
        <section className="bg-sky-100 border border-sky-500 p-4 rounded-3xl">
          <h2 className="font-bold text-lg">所持キャラー一覧</h2>
          <p className="text-xs text-slate-600 mt-1">
            所持キャラ数：{characters.length} 体
          </p>

          {/* ★関連問題パネル（ここはそのまま） */}
          {relOpen && (
            <div className="mt-3 bg-white border border-sky-300 rounded-2xl p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-extrabold text-sky-900">
                    関連問題：{relChar?.name || '---'}
                  </div>
                  <div className="text-xs text-slate-600">
                    （問題文 / 正解 / 別解 に検索ワードが含まれる問題）
                  </div>
                </div>
                <button
                  onClick={() => setRelOpen(false)}
                  className="px-3 py-1 rounded-full border bg-white text-xs font-bold text-slate-700"
                >
                  閉じる
                </button>
              </div>

              {relLoading ? (
                <div className="mt-2 text-sm text-slate-600">読み込み中…</div>
              ) : relError ? (
                <div className="mt-2 text-sm text-red-700 whitespace-pre-wrap">
                  {relError}
                </div>
              ) : relQs.length === 0 ? (
                <div className="mt-2 text-sm text-slate-600">
                  該当する問題がありません
                </div>
              ) : (
                <div className="mt-2 max-h-[320px] overflow-auto border rounded-xl p-2 bg-sky-50">
                  {relQs.map((q) => (
                    <div key={q.id} className="py-2 border-b last:border-b-0">
                      <div className="text-[11px] font-extrabold text-slate-700">
                        #{q.id} / {q.type || 'type'}
                      </div>
                      <div className="text-sm font-bold text-slate-900 whitespace-pre-wrap mt-1">
                        {String(q.question_text ?? q.question ?? '')}
                      </div>
                      <div className="text-xs text-slate-700 whitespace-pre-wrap mt-1">
                        答え：{String(q.correct_answer ?? '')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ★ソート切り替え：キャラNo順の右に「関連問題」ソートを追加 */}
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex gap-2 text-sm">
              <button
                onClick={() => setSortMode('acquired')}
                className={`px-3 py-1 rounded-full border ${
                  sortMode === 'acquired'
                    ? 'bg-sky-600 text-white'
                    : 'bg-white text-sky-700'
                }`}
              >
                入手順
              </button>
              <button
                onClick={() => setSortMode('rarity')}
                className={`px-3 py-1 rounded-full border ${
                  sortMode === 'rarity'
                    ? 'bg-sky-600 text-white'
                    : 'bg-white text-sky-700'
                }`}
              >
                レア度順
              </button>
              <button
                onClick={() => setSortMode('no')}
                className={`px-3 py-1 rounded-full border ${
                  sortMode === 'no'
                    ? 'bg-sky-600 text-white'
                    : 'bg-white text-sky-700'
                }`}
              >
                キャラNo.順
              </button>
            </div>

            <button
              onClick={() => setSortMode('no_related')}
              className={`px-3 py-1 rounded-full border text-sm whitespace-nowrap ${
                sortMode === 'no_related'
                  ? 'bg-sky-600 text-white'
                  : 'bg-white text-sky-700'
              }`}
            >
              関連問題
            </button>
          </div>

          {/* キャラ一覧：ボタン廃止。カードクリックで挙動切り替え */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {sorted.map((ch) => {
              const starValue = getStarsValue(ch);
              const { s, stars, sizeClass } = getStarVisual(starValue);
              const selected = isSelected(ch.character_id);

              // ★6以上 → 虹枠専用
              if (s >= 6) {
                const innerBg = getRainbowInnerBg(s);
                return (
                  <div
                    key={ch.character_id}
                    onClick={() => onCardClick(ch)}
                    className="cursor-pointer"
                  >
                    <div
                      className={
                        'rounded-3xl p-[2px] shadow-md hover:-translate-y-[1px] transition-transform' +
                        (sortMode !== 'no_related' && selected
                          ? ' ring-2 ring-sky-400 ring-offset-2 ring-offset-sky-50'
                          : '')
                      }
                      style={{
                        backgroundImage:
                          'conic-gradient(#ff3366,#ffdd33,#33ff66,#33ddff,#9966ff,#ff33cc,#ff3366)',
                      }}
                    >
                      <div
                        className="rounded-[22px] px-4 py-3 flex flex-col justify-between"
                        style={{ backgroundImage: innerBg }}
                      >
                        <div>
                          <div className="text-[11px] text-slate-600 mb-1">
                            No.{ch.char_no ?? ch.character_id}
                          </div>
                          <div className="text-sm font-bold text-slate-900 mb-1 line-clamp-2">
                            {ch.name}
                          </div>
                        </div>

                        <div className="flex items-baseline justify-between mt-2">
                          <span
                            className={
                              sizeClass +
                              ' font-bold text-amber-400 drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]'
                            }
                          >
                            {stars}
                          </span>
                          <div className="text-[11px] text-right text-slate-600">
                            <div>元レア度：{getBaseRarity(ch)}</div>
                            <div>現在★：{s}</div>
                          </div>
                        </div>

                        {sortMode === 'no_related' && (
                          <div className="mt-2 text-[11px] font-extrabold text-sky-700">
                            タップで関連問題
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              // ★1〜5（普通枠）
              const cardClass =
                sortMode === 'no_related'
                  ? getNormalCardClass(s, false)
                  : getNormalCardClass(s, selected);

              return (
                <div
                  key={ch.character_id}
                  className={cardClass}
                  onClick={() => onCardClick(ch)}
                >
                  <div>
                    <div className="text-[11px] text-slate-600 mb-1">
                      No.{ch.char_no ?? ch.character_id}
                    </div>
                    <div className="text-sm font-bold text-slate-900 mb-1 line-clamp-2">
                      {ch.name}
                    </div>
                  </div>

                  <div className="flex items-baseline justify-between mt-2">
                    <span
                      className={
                        sizeClass +
                        ' font-bold text-amber-400 drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]'
                      }
                    >
                      {stars}
                    </span>
                    <div className="text-[11px] text-right text-slate-600">
                      <div>元レア度：{getBaseRarity(ch)}</div>
                      <div>現在★：{s}</div>
                    </div>
                  </div>

                  {sortMode === 'no_related' && (
                    <div className="mt-2 text-[11px] font-extrabold text-sky-700">
                      タップで関連問題
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
