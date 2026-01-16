// file: app/my-team/page.js
'use client';

import { useEffect, useMemo, useState } from 'react';

export default function MyTeamPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);

  const [characters, setCharacters] = useState([]); // 所持キャラ
  const [teamIds, setTeamIds] = useState([]);       // ['123','496', ...]

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // ★タブ
  // acquired: 入手順 / rarity: レア度順 / charno: キャラNo順 / charno_related: キャラNo順（関連問題）
  const [tab, setTab] = useState('acquired');

  // ★関連問題表示
  const [relOpen, setRelOpen] = useState(false);
  const [relLoading, setRelLoading] = useState(false);
  const [relError, setRelError] = useState('');
  const [relChar, setRelChar] = useState(null);
  const [relQs, setRelQs] = useState([]);

  // ===== 初期ロード =====
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError('');
        setMessage('');

        const meRes = await fetch('/api/me', { cache: 'no-store' });
        const meJson = await meRes.json();

        if (!meRes.ok || !meJson.user) {
          setError('ログイン情報の取得に失敗しました。ログインし直してください。');
          setLoading(false);
          return;
        }

        const uid = Number(meJson.user.id);
        setUserId(uid);

        const [charsRes, teamRes] = await Promise.all([
          fetch(`/api/user/characters?user_id=${uid}`, { cache: 'no-store' }),
          fetch(`/api/user/team?user_id=${uid}`, { cache: 'no-store' }),
        ]);

        const charsJson = await charsRes.json();
        const teamJson = await teamRes.json();

        if (!charsRes.ok) throw new Error(charsJson.error || 'キャラ一覧の取得に失敗しました');
        if (!teamRes.ok) throw new Error(teamJson.error || 'マイチームの取得に失敗しました');

        setCharacters(charsJson.characters || []);

        const team = teamJson.team || [];
        const ids = team.map((t) => String(t.character_id));
        setTeamIds(ids);
      } catch (e) {
        console.error(e);
        setError(e.message || '読み込み中にエラーが発生しました');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // 図鑑の中で、このキャラがマイチームに選ばれているか
  const isSelected = (characterId) => teamIds.includes(String(characterId));

  // 図鑑キャラをクリック → マイチームに追加 / 削除
  const toggleCharacter = (characterIdRaw) => {
    setMessage('');
    setError('');
    const idStr = String(characterIdRaw);

    if (teamIds.includes(idStr)) {
      setTeamIds(teamIds.filter((id) => id !== idStr));
      return;
    }

    if (teamIds.length >= 5) {
      setError('マイチームは最大5体までです');
      return;
    }

    setTeamIds([...teamIds, idStr]);
  };

  // 保存ボタン
  const saveTeam = async () => {
    if (!userId) return;

    try {
      setSaving(true);
      setError('');
      setMessage('');

      const numericIds = teamIds.map((id) => Number(id)).filter((n) => Number.isFinite(n));

      const res = await fetch('/api/user/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          character_ids: numericIds,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'マイチームの保存に失敗しました');

      setMessage('マイチームを保存しました！');
    } catch (e) {
      console.error(e);
      setError(e.message || 'マイチームの保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 編成リセット（DB 上も空にする）
  const resetTeam = async () => {
    setTeamIds([]);
    await saveTeam();
  };

  // ★関連問題を開く
  const openRelated = async (ch) => {
    setRelOpen(true);
    setRelLoading(true);
    setRelError('');
    setRelQs([]);
    setRelChar(ch);

    try {
      const res = await fetch(`/api/characters/${ch.character_id}/related-questions`, {
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

  // ★タブ別表示（並び替え）
  const shownCharacters = useMemo(() => {
    const arr = [...(characters || [])];

    if (tab === 'rarity') {
      arr.sort((a, b) => {
        const ra = Number(a.base_rarity ?? 1);
        const rb = Number(b.base_rarity ?? 1);
        if (rb !== ra) return rb - ra;
        const na = Number(a.char_no ?? 0);
        const nb = Number(b.char_no ?? 0);
        return na - nb;
      });
      return arr;
    }

    if (tab === 'charno' || tab === 'charno_related') {
      arr.sort((a, b) => Number(a.char_no ?? 0) - Number(b.char_no ?? 0));
      return arr;
    }

    // acquired（入手順）…APIの並びをそのまま
    return arr;
  }, [characters, tab]);

  // ★タブボタン
  const TabButton = ({ id, label }) => {
    const active = tab === id;
    return (
      <button
        onClick={() => setTab(id)}
        style={{
          padding: '8px 12px',
          borderRadius: 999,
          border: active ? '2px solid #1677ff' : '1px solid rgba(0,0,0,0.20)',
          background: active ? '#e8f2ff' : '#fff',
          color: '#111',
          fontWeight: 900,
          cursor: 'pointer',
          fontSize: 12,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '24px',
        backgroundColor: '#d8f1ff',
        color: '#222',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>
          マイチーム編成
        </h1>

        <p style={{ marginBottom: '16px', fontSize: '14px' }}>
          所持キャラ図鑑から、最大 5 体までマイチームとして選択できます。
          対戦時のマッチング画面に表示されます（能力には影響しません）。
        </p>

        {/* メッセージ */}
        {error && (
          <div
            style={{
              marginBottom: '12px',
              padding: '8px 12px',
              borderRadius: '8px',
              backgroundColor: '#ffe5e5',
              color: '#a00000',
              fontSize: '14px',
            }}
          >
            {error}
          </div>
        )}
        {message && (
          <div
            style={{
              marginBottom: '12px',
              padding: '8px 12px',
              borderRadius: '8px',
              backgroundColor: '#e5ffe9',
              color: '#0a7a2a',
              fontSize: '14px',
            }}
          >
            {message}
          </div>
        )}

        {/* ★関連問題パネル */}
        {relOpen && (
          <section
            style={{
              marginBottom: '16px',
              padding: '16px',
              borderRadius: '12px',
              backgroundColor: '#ffffff',
              boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 'bold', color: '#111' }}>
                  関連問題：{relChar?.name || '---'}
                </div>
                <div style={{ fontSize: 12, color: '#555' }}>
                  （問題文 / 正解 / 別解 に検索ワードが含まれる問題）
                </div>
              </div>

              <button
                onClick={() => setRelOpen(false)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: '1px solid #888',
                  background: '#fff',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  color: '#333',
                }}
              >
                閉じる
              </button>
            </div>

            {relLoading ? (
              <div style={{ marginTop: 10, color: '#555', fontSize: 14 }}>読み込み中...</div>
            ) : relError ? (
              <div style={{ marginTop: 10, color: '#a00000', fontSize: 14 }}>{relError}</div>
            ) : relQs.length === 0 ? (
              <div style={{ marginTop: 10, color: '#555', fontSize: 14 }}>該当する問題がありません</div>
            ) : (
              <div
                style={{
                  marginTop: 10,
                  maxHeight: 360,
                  overflow: 'auto',
                  border: '1px solid rgba(0,0,0,0.10)',
                  borderRadius: 10,
                  padding: 10,
                  background: '#fbfdff',
                }}
              >
                {relQs.map((q) => {
                  const qt = (q.question_text ?? q.question ?? '').toString();
                  const ans = (q.correct_answer ?? '').toString();
                  return (
                    <div
                      key={q.id}
                      style={{
                        borderBottom: '1px solid rgba(0,0,0,0.08)',
                        padding: '10px 0',
                      }}
                    >
                      <div style={{ fontWeight: 800, color: '#111', fontSize: 13 }}>
                        #{q.id} / {q.type || 'type'}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap', color: '#111', fontSize: 13, marginTop: 6 }}>
                        {qt}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap', color: '#444', fontSize: 12, marginTop: 6 }}>
                        答え：{ans}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* マイチーム表示 */}
        <section
          style={{
            marginBottom: '24px',
            padding: '16px',
            borderRadius: '12px',
            backgroundColor: '#ffffff',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>
            現在のマイチーム（最大5体）
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
              gap: '8px',
            }}
          >
            {[0, 1, 2, 3, 4].map((slot) => {
              const cidStr = teamIds[slot];
              const char = shownCharacters.find((c) => String(c.character_id) === cidStr) || null;

              return (
                <div
                  key={slot}
                  style={{
                    borderRadius: '10px',
                    border: '2px solid #99c9ff',
                    backgroundColor: '#f5f8ff',
                    padding: '8px',
                    minHeight: '72px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ fontSize: '12px', marginBottom: '4px', color: '#555' }}>
                    SLOT {slot + 1}
                  </div>
                  {char ? (
                    <>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '2px', color: '#111' }}>
                        {char.name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#444' }}>
                        レア度: {char.base_rarity} / ★{char.stars}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#888' }}>（未設定）</div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={saveTeam}
              disabled={saving || !userId}
              style={{
                padding: '10px 20px',
                borderRadius: '999px',
                border: 'none',
                cursor: saving || !userId ? 'default' : 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
                background:
                  saving || teamIds.length === 0 || !userId
                    ? '#b0c7de'
                    : 'linear-gradient(90deg, #4a8dff, #5bc5ff)',
                color: '#ffffff',
                opacity: saving ? 0.8 : 1,
              }}
            >
              {saving ? '保存中...' : 'この編成で保存する'}
            </button>

            <button
              type="button"
              onClick={resetTeam}
              style={{
                padding: '10px 16px',
                borderRadius: '999px',
                border: '1px solid #888',
                backgroundColor: '#ffffff',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 'bold',
                color: '#333',
              }}
            >
              編成をリセットする
            </button>
          </div>
        </section>

        {/* 図鑑一覧 */}
        <section
          style={{
            marginBottom: '24px',
            padding: '16px',
            borderRadius: '12px',
            backgroundColor: '#ffffff',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
            所持キャラ一覧
          </h2>

          {/* ★タブ行：キャラNo順 は残す / さらに キャラNo順（関連問題）を追加 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'nowrap',
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <TabButton id="acquired" label="入手順" />
              <TabButton id="rarity" label="レア度順" />
              <TabButton id="charno" label="キャラNo順" />
            </div>

            <div style={{ marginLeft: 'auto' }}>
              <TabButton id="charno_related" label="キャラNo順（関連問題）" />
            </div>
          </div>

          {loading ? (
            <div style={{ fontSize: '14px', color: '#555' }}>読み込み中...</div>
          ) : shownCharacters.length === 0 ? (
            <div style={{ fontSize: '14px', color: '#555' }}>
              まだキャラを所持していません。ガチャを引いてみましょう。
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '10px',
              }}
            >
              {shownCharacters.map((ch) => {
                const selected = isSelected(ch.character_id);

                const borderColor =
                  ch.base_rarity >= 7
                    ? '#ffb400'
                    : ch.base_rarity >= 5
                    ? '#ff7a7a'
                    : ch.base_rarity >= 3
                    ? '#7ab0ff'
                    : '#cccccc';

                // ★重要：タブで挙動を切り替える
                // charno_related のときだけ「タッチ＝関連問題」
                const onTap = () => {
                  if (tab === 'charno_related') {
                    openRelated(ch);
                    return;
                  }
                  toggleCharacter(ch.character_id);
                };

                return (
                  <button
                    key={ch.character_id}
                    onClick={onTap}
                    style={{
                      textAlign: 'left',
                      borderRadius: '10px',
                      border: selected ? `3px solid #3b8cff` : `2px solid ${borderColor}`,
                      backgroundColor: selected ? '#e5f1ff' : '#fdfdfd',
                      padding: '8px',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    <div style={{ fontSize: 11, color: '#444', fontWeight: 900 }}>
                      No.{ch.char_no ?? '-'}
                    </div>

                    <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px', color: '#222' }}>
                      {ch.name}
                    </div>

                    <div style={{ fontSize: '12px', color: '#555', marginBottom: '2px' }}>
                      レア度: {ch.base_rarity}
                    </div>

                    <div style={{ fontSize: '12px', color: '#555' }}>
                      ★ {ch.stars}
                    </div>

                    {tab !== 'charno_related' && selected && (
                      <div style={{ marginTop: '4px', fontSize: '11px', color: '#0a5ec2', fontWeight: 'bold' }}>
                        マイチームに選択中
                      </div>
                    )}

                    {tab === 'charno_related' && (
                      <div style={{ marginTop: 6, fontSize: 11, color: '#0a5ec2', fontWeight: 900 }}>
                        タッチで関連問題
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
