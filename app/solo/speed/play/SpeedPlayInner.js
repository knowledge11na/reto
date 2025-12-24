// file: app/solo/speed/play/SpeedPlayInner.js
'use client';

import { useEffect, useMemo, useRef, useState, forwardRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

const HAND_MAX = 4;

// ====== ルール ======
function clampDigit(x) {
  const n = Number(String(x ?? '').trim());
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 9) return null;
  return n;
}
function canPlay(digit, topDigit) {
  if (digit == null || topDigit == null) return false;
  return digit === topDigit || digit === topDigit - 1 || digit === topDigit + 1;
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ★ 不備報告（振り返り）では「フルの答え」を正解として表示する
// API側で card.answerNumber を入れているのでそれを優先して使う
function getFullAnswerText(card) {
  if (!card) return '';
  const v =
    card.answerNumber ?? // ← route.js で入ってる
    card.fullAnswer ??
    card.answerFull ??
    card.answer ??
    card.answerText ??
    card.correctAnswer ??
    card.valueFull ??
    card.value;

  // 最後の保険：digit
  return String(v ?? card.digit ?? '');
}

// CPU難易度設定（弱く）
function cpuParams(diff) {
  if (diff === 'weak')
    return { thinkMin: 10000, thinkMax: 15000, missRate: 0.55, chain: false, lock: false };
  if (diff === 'hard')
    return { thinkMin: 6000, thinkMax: 8000, missRate: 0.2, chain: true, lock: true };
  if (diff === 'extra')
    return { thinkMin: 4000, thinkMax: 6000, missRate: 0.03, chain: true, lock: true };
  return { thinkMin: 8000, thinkMax: 10000, missRate: 0.45, chain: false, lock: false };
}

export default function SpeedPlayInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const diff = (sp.get('diff') || 'normal').toString();
  const cpuCfg = useMemo(() => cpuParams(diff), [diff]);

  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');

  const [playerDeck, setPlayerDeck] = useState([]);
  const [cpuDeck, setCpuDeck] = useState([]);
  const [playerHand, setPlayerHand] = useState([]);
  const [cpuHand, setCpuHand] = useState([]); // 相手も見える
  const [center, setCenter] = useState([null, null]); // 台札2（左=CPU, 右=自分）

  const [playerScore, setPlayerScore] = useState(0);
  const [cpuScore, setCpuScore] = useState(0);

  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  const [answerHistory, setAnswerHistory] = useState([]);

  // フル表示モーダル
  const [openCard, setOpenCard] = useState(null); // { text, place, owner }

  const pileRef0 = useRef(null); // 左（CPU）
  const pileRef1 = useRef(null); // 右（自分）

  // 初期ロード
  useEffect(() => {
    (async () => {
      setLoading(true);
      setErrorText('');
      try {
        const r = await fetch('/api/solo/speed-questions', { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(j.error || 'load failed');

        let pDeck = shuffle(j.playerDeck || []);
        let cDeck = shuffle(j.cpuDeck || []);
        const c = j.center || [null, null];

        setCenter([c[0], c[1]]);

        const pHand = pDeck.splice(0, HAND_MAX);
        const cHand = cDeck.splice(0, HAND_MAX);

        setPlayerDeck(pDeck);
        setCpuDeck(cDeck);
        setPlayerHand(pHand);
        setCpuHand(cHand);

        setPlayerScore(0);
        setCpuScore(0);
        setAnswerHistory([]);
        setMessage('');
        setOpenCard(null);

        setStatus('playing');
      } catch (e) {
        setErrorText(String(e?.message || e));
        setStatus('finished');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function refillHands() {
    setPlayerHand((h) => {
      let nh = [...h];
      setPlayerDeck((d) => {
        let nd = [...d];
        while (nh.length < HAND_MAX && nd.length > 0) nh.push(nd.shift());
        return nd;
      });
      return nh;
    });

    setCpuHand((h) => {
      let nh = [...h];
      setCpuDeck((d) => {
        let nd = [...d];
        while (nh.length < HAND_MAX && nd.length > 0) nh.push(nd.shift());
        return nd;
      });
      return nh;
    });
  }

  // ====== 「更新」ボタンを押せる条件 ======
  // 自分が出せるカードが1枚でもあるなら、更新は禁止
  const playerHasPlayableMove = useMemo(() => {
    if (status !== 'playing') return false;
    if (!playerHand.length) return false;
    const a = center[0]?.digit ?? null;
    const b = center[1]?.digit ?? null;
    for (const c of playerHand) {
      if (!c) continue;
      if (canPlay(c.digit, a) || canPlay(c.digit, b)) return true;
    }
    return false;
  }, [status, playerHand, center]);

  // ====== ゲーム終了 ======
  // どちらかが0枚（山札+手札）になったら終了 → リザルトへ
  function finishGame(reason = '') {
    if (status !== 'playing') return;

    // 終了時点で「出せなかった（未使用）」カードも履歴に入れる
    const leftPlayer = [...playerHand, ...playerDeck];
    const leftCpu = [...cpuHand, ...cpuDeck];

    setAnswerHistory((prev) => {
      const extra = [];

      // 自分の未使用カード
      for (const c of leftPlayer) {
        if (!c) continue;
        extra.push({
          question_id: c.id,
          text: `${c.text}（${c.place}）`,
          userAnswerText: '（出せず終了 / 未使用）',
          // ★ フル答え
          correctAnswerText: getFullAnswerText(c),
        });
      }

      // CPUの未使用
      for (const c of leftCpu) {
        if (!c) continue;
        extra.push({
          question_id: c.id,
          text: `${c.text}（${c.place}）`,
          userAnswerText: '（CPU未使用）',
          // ★ フル答え
          correctAnswerText: getFullAnswerText(c),
        });
      }

      return [...prev, ...extra];
    });

    setMessage(reason || '終了');
    setStatus('finished');

    // localStorage保存＆レビューへ
    setTimeout(() => {
      const payload = {
        diff,
        playerScore,
        cpuScore,
        finishedAt: Date.now(),
        history: answerHistory,
      };

      try {
        localStorage.setItem(
          'speed_last_result',
          JSON.stringify({
            ...payload,
            // 終了時点の残りカードも確実に入れる
            history: [
              ...(Array.isArray(answerHistory) ? answerHistory : []),
              ...leftPlayer
                .filter(Boolean)
                .map((c) => ({
                  question_id: c.id,
                  text: `${c.text}（${c.place}）`,
                  userAnswerText: '（出せず終了 / 未使用）',
                  // ★ フル答え
                  correctAnswerText: getFullAnswerText(c),
                })),
              ...leftCpu
                .filter(Boolean)
                .map((c) => ({
                  question_id: c.id,
                  text: `${c.text}（${c.place}）`,
                  userAnswerText: '（CPU未使用）',
                  // ★ フル答え
                  correctAnswerText: getFullAnswerText(c),
                })),
            ],
          })
        );
      } catch {}

      router.push('/solo/speed/review');
    }, 0);
  }

  // 終了条件監視（どちらか0枚）
  useEffect(() => {
    if (status !== 'playing') return;

    const pRemain = playerDeck.length + playerHand.length;
    const cRemain = cpuDeck.length + cpuHand.length;

    if (pRemain === 0) {
      finishGame('あなたのカードが0枚になった！');
      return;
    }
    if (cRemain === 0) {
      finishGame('CPUのカードが0枚になった！');
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, playerDeck.length, playerHand.length, cpuDeck.length, cpuHand.length]);

  // ====== 更新：左右固定でそれぞれ1枚ずつ台札に出す（左=CPU、右=自分） ======
  // 山札があれば山札から、無ければ手札からランダムで出す
  function refreshCenter() {
    if (status !== 'playing') return;
    if (playerHasPlayableMove) {
      setMessage('出せるカードがあるので更新できない！');
      return;
    }

    const pRemain = playerDeck.length + playerHand.length;
    const cRemain = cpuDeck.length + cpuHand.length;
    if (pRemain === 0 || cRemain === 0) {
      finishGame('どちらかが0枚なので終了！');
      return;
    }

    setMessage('更新！左右に1枚ずつ出した');

    // CPU左
    const drawCpu = () =>
      new Promise((resolve) => {
        setCpuDeck((cd) => {
          const nd = [...cd];
          if (nd.length > 0) {
            const card = nd.shift();
            resolve({ from: 'deck', card });
            return nd;
          }
          resolve(null);
          return nd;
        });
      }).then(async (res) => {
        if (res?.card) return res.card;

        // 山札なし→手札からランダム
        return new Promise((resolve) => {
          setCpuHand((h) => {
            const nh = [...h];
            if (nh.length === 0) {
              resolve(null);
              return nh;
            }
            const idx = Math.floor(Math.random() * nh.length);
            const card = nh[idx];
            nh.splice(idx, 1);
            resolve(card);
            return nh;
          });
        });
      });

    // 自分右
    const drawPlayer = () =>
      new Promise((resolve) => {
        setPlayerDeck((pd) => {
          const nd = [...pd];
          if (nd.length > 0) {
            const card = nd.shift();
            resolve({ from: 'deck', card });
            return nd;
          }
          resolve(null);
          return nd;
        });
      }).then(async (res) => {
        if (res?.card) return res.card;

        // 山札なし→手札からランダム
        return new Promise((resolve) => {
          setPlayerHand((h) => {
            const nh = [...h];
            if (nh.length === 0) {
              resolve(null);
              return nh;
            }
            const idx = Math.floor(Math.random() * nh.length);
            const card = nh[idx];
            nh.splice(idx, 1);
            resolve(card);
            return nh;
          });
        });
      });

    (async () => {
      const [cpuCard, playerCard] = await Promise.all([drawCpu(), drawPlayer()]);

      setCenter((prev) => {
        const next = [...prev];
        if (cpuCard) next[0] = cpuCard; // 左
        if (playerCard) next[1] = playerCard; // 右
        return next;
      });

      // 履歴に「更新で出た」も残す（振り返りで見たい）
      setAnswerHistory((prev) => {
        const add = [];
        if (cpuCard) {
          add.push({
            question_id: cpuCard.id,
            text: `${cpuCard.text}（${cpuCard.place}）`,
            userAnswerText: '（更新でCPUが場に出した）',
            // ★ フル答え
            correctAnswerText: getFullAnswerText(cpuCard),
          });
        }
        if (playerCard) {
          add.push({
            question_id: playerCard.id,
            text: `${playerCard.text}（${playerCard.place}）`,
            userAnswerText: '（更新で自分が場に出した）',
            // ★ フル答え
            correctAnswerText: getFullAnswerText(playerCard),
          });
        }
        return [...prev, ...add];
      });

      setTimeout(() => refillHands(), 0);
    })();
  }

  // ====== プレイヤー：スワイプで台札に重ねて出す ======
  function playPlayerCard(handIndex, pileIndex) {
    if (status !== 'playing') return;
    const card = playerHand[handIndex];
    if (!card) return;

    const topDigit = center[pileIndex]?.digit ?? null;
    if (!canPlay(card.digit, topDigit)) {
      setMessage('出せない（台札と±1じゃない）');
      // ★ 出せなかったカードも履歴に残す（要件）
      setAnswerHistory((prev) => [
        ...prev,
        {
          question_id: card.id,
          text: `${card.text}（${card.place}）`,
          userAnswerText: '（出そうとしたが出せなかった）',
          // ★ フル答え
          correctAnswerText: getFullAnswerText(card),
        },
      ]);
      return;
    }

    setCenter((prev) => {
      const next = [...prev];
      next[pileIndex] = card;
      return next;
    });

    setPlayerHand((h) => h.filter((_, i) => i !== handIndex));
    setPlayerScore((s) => s + 1);

    setAnswerHistory((prev) => [
      ...prev,
      {
        question_id: card.id,
        text: `${card.text}（${card.place}）`,
        userAnswerText: '（スワイプで場に出した）',
        // ★ フル答え
        correctAnswerText: getFullAnswerText(card),
      },
    ]);

    setMessage('ナイス！');
    setTimeout(() => refillHands(), 0);
  }

  // ====== CPU行動 ======
  useEffect(() => {
    if (status !== 'playing') return;

    let alive = true;
    const tick = async () => {
      while (alive && status === 'playing') {
        const wait =
          cpuCfg.thinkMin + Math.floor(Math.random() * (cpuCfg.thinkMax - cpuCfg.thinkMin + 1));
        await new Promise((r) => setTimeout(r, wait));
        if (!alive) break;

        if (cpuCfg.missRate > 0 && Math.random() < cpuCfg.missRate) continue;

        const a = center[0]?.digit ?? null;
        const b = center[1]?.digit ?? null;

        const hand = cpuHand;
        if (!hand || !hand.length) {
          refillHands();
          continue;
        }

        const playable = [];
        for (let i = 0; i < hand.length; i++) {
          const c = hand[i];
          if (!c) continue;
          if (canPlay(c.digit, a)) playable.push({ idx: i, pile: 0, card: c });
          if (canPlay(c.digit, b)) playable.push({ idx: i, pile: 1, card: c });
        }
        if (!playable.length) continue;

        let pick = playable[0];

        if (cpuCfg.lock) {
          playable.sort((x, y) => {
            const sx =
              Math.abs(5 - x.card.digit) + (x.card.digit === 0 || x.card.digit === 9 ? 1 : 0);
            const sy =
              Math.abs(5 - y.card.digit) + (y.card.digit === 0 || y.card.digit === 9 ? 1 : 0);
            return sy - sx;
          });
          pick = playable[0];
        } else {
          pick = playable[Math.floor(Math.random() * playable.length)];
        }

        setCenter((prev) => {
          const next = [...prev];
          next[pick.pile] = pick.card;
          return next;
        });

        setCpuHand((h) => h.filter((_, i) => i !== pick.idx));
        setCpuScore((s) => s + 1);
        setMessage('CPUが出した');
        setTimeout(() => refillHands(), 0);

        // ★ CPUが場に出したカードも履歴に残す（要件）
        setAnswerHistory((prev) => [
          ...prev,
          {
            question_id: pick.card.id,
            text: `${pick.card.text}（${pick.card.place}）`,
            userAnswerText: `（CPUが場に出した：pile=${pick.pile === 0 ? '左' : '右'}）`,
            // ★ フル答え
            correctAnswerText: getFullAnswerText(pick.card),
          },
        ]);

        if (!cpuCfg.chain) continue;
        await new Promise((r) => setTimeout(r, Math.floor(wait * 0.35)));
      }
    };

    tick();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, cpuCfg, center, cpuHand]);

  if (loading || status === 'loading') {
    return (
      <main className="min-h-screen bg-emerald-950 text-emerald-50 p-4">
        <div className="max-w-3xl mx-auto">読み込み中…</div>
      </main>
    );
  }

  if (status === 'finished') {
    return (
      <main className="min-h-screen bg-emerald-950 text-emerald-50 p-4">
        <div className="max-w-3xl mx-auto space-y-3">
          <h1 className="text-xl font-extrabold">終了</h1>
          {errorText ? (
            <div className="text-rose-200">{errorText}</div>
          ) : (
            <div className="text-emerald-50/90 text-sm">結果ページへ移動します…</div>
          )}
          <Link className="underline text-emerald-200" href="/solo/speed">
            戻る
          </Link>
        </div>
      </main>
    );
  }

  const pRemain = playerDeck.length + playerHand.length;
  const cRemain = cpuDeck.length + cpuHand.length;

  return (
    <main className="min-h-screen bg-emerald-800 text-white relative overflow-hidden speed-nozoom">
      <style jsx global>{`
        @media (max-width: 640px) {
          .speed-nozoom input,
          .speed-nozoom textarea,
          .speed-nozoom select {
            font-size: 16px !important;
          }
        }
      `}</style>

      <div className="max-w-5xl mx-auto p-2 sm:p-3">
        <header className="hdr">
          <div className="ttl">DIGIT SPEED（{diff}）</div>
          <div className="meta">
            <div className="m">
              あなた：<b>{playerScore}</b>
            </div>
            <div className="m">
              CPU：<b>{cpuScore}</b>
            </div>
            <div className="m">
              残り枚数 あなた：<b>{pRemain}</b>
            </div>
            <div className="m">
              CPU：<b>{cRemain}</b>
            </div>
            <Link className="lnk" href="/solo/speed">
              ルールへ
            </Link>
          </div>
        </header>

        <div className="board">
          {/* CPU */}
          <div className="row top">
            <div className="area">
              <div className="label">CPUの手札</div>
              <div className="handGrid">
                {cpuHand.map((c) => (
                  <button
                    key={c.id}
                    className="tapBtn"
                    onClick={() => setOpenCard({ owner: 'CPU', text: c.text, place: c.place })}
                  >
                    <CardView card={c} />
                  </button>
                ))}
                {cpuHand.length < HAND_MAX &&
                  Array.from({ length: HAND_MAX - cpuHand.length }).map((_, i) => (
                    <EmptyCard key={`ce-${i}`} />
                  ))}
              </div>
            </div>
          </div>

          {/* 台札（表示は問題文。判定はdigitで内部的にやってる） */}
          <div className="row mid">
            <div className="midWrap">
              <div className="label">台札（左=CPU / 右=あなた）</div>
              <div className="centerPiles">
                <PileCard
                  ref={pileRef0}
                  card={center[0]}
                  onOpen={(c) => setOpenCard({ owner: '台札（左/CPU）', text: c.text, place: c.place })}
                />
                <PileCard
                  ref={pileRef1}
                  card={center[1]}
                  onOpen={(c) => setOpenCard({ owner: '台札（右/あなた）', text: c.text, place: c.place })}
                />
              </div>

              <div className="midBtns">
                <button
                  className="btn"
                  onClick={refreshCenter}
                  disabled={playerHasPlayableMove}
                  title={playerHasPlayableMove ? '出せるカードがあるので更新できません' : '左右に1枚ずつ出す'}
                  style={{
                    opacity: playerHasPlayableMove ? 0.45 : 1,
                    cursor: playerHasPlayableMove ? 'not-allowed' : 'pointer',
                  }}
                >
                  更新（左右に1枚ずつ）
                </button>
              </div>

              <div className="hint">
                出せる条件：台札の数字（内部）と <b>同じ</b> / <b>±1</b>
                <br />
                ※ 出せるカードがある時は更新できない
              </div>
            </div>
          </div>

          {/* Player */}
          <div className="row bottom">
            <div className="area">
              <div className="label">あなたの手札（スワイプで台札へ重ねる）</div>
              <div className="handGrid">
                {playerHand.map((c, i) => (
                  <DragCard
                    key={c.id}
                    card={c}
                    index={i}
                    piles={[pileRef0, pileRef1]}
                    center={center}
                    status={status}
                    onPlay={(pileIndex) => playPlayerCard(i, pileIndex)}
                    onNoDrop={() => setMessage('台札に重ねて出してね')}
                    onCantPlay={(pileIndex) => {
                      setMessage('出せない（台札と±1じゃない）');
                      // ★ 出せなかったカードも履歴に残す（要件）
                      setAnswerHistory((prev) => [
                        ...prev,
                        {
                          question_id: c.id,
                          text: `${c.text}（${c.place}）`,
                          userAnswerText: `（出そうとしたが出せなかった：pile=${pileIndex === 0 ? '左' : '右'}）`,
                          // ★ フル答え
                          correctAnswerText: getFullAnswerText(c),
                        },
                      ]);
                    }}
                    onTap={() => setOpenCard({ owner: 'あなた', text: c.text, place: c.place })}
                  />
                ))}
                {playerHand.length < HAND_MAX &&
                  Array.from({ length: HAND_MAX - playerHand.length }).map((_, i) => (
                    <EmptyCard key={`pe-${i}`} />
                  ))}
              </div>
            </div>
          </div>
        </div>

        {message ? <div className="msg">{message}</div> : null}
      </div>

      {/* 全文モーダル */}
      {openCard && (
        <div className="modalBg" onClick={() => setOpenCard(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalTop">
              <div className="modalTitle">{openCard.owner}</div>
              <button className="x" onClick={() => setOpenCard(null)}>
                ×
              </button>
            </div>
            <div className="modalCard">
              <div className="modalText">{openCard.text}</div>
              <div className="modalPlace">（{openCard.place}）</div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .hdr {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 6px;
        }
        .ttl {
          font-weight: 1000;
          letter-spacing: 0.02em;
          font-size: 14px;
          text-shadow: 0 1px 0 rgba(0, 0, 0, 0.22);
          white-space: nowrap;
        }
        .meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 10px;
          align-items: center;
          justify-content: flex-end;
          font-size: 11px;
          opacity: 0.95;
        }
        .m b {
          font-weight: 1000;
        }
        .lnk {
          text-decoration: underline;
          color: rgba(236, 253, 245, 0.92);
          font-weight: 900;
        }

        .board {
          border-radius: 16px;
          padding: 10px;
          background: rgba(0, 0, 0, 0.1);
          border: 2px solid rgba(255, 255, 255, 0.12);
        }

        .row {
          display: flex;
          justify-content: center;
        }
        .top {
          margin-bottom: 8px;
        }
        .mid {
          margin: 10px 0;
        }
        .bottom {
          margin-top: 6px;
        }

        .area {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 6px;
          align-items: center;
        }
        .label {
          font-size: 11px;
          font-weight: 1000;
          opacity: 0.95;
          text-align: center;
        }

        /* 4枚を必ず枠内に収める：Gridで固定 */
        .handGrid {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          align-items: stretch;
        }
        @media (max-width: 420px) {
          .handGrid {
            gap: 6px;
          }
        }

        .tapBtn {
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
        }

        .midWrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .centerPiles {
          display: flex;
          gap: 12px;
          justify-content: center;
          align-items: center;
        }
        .midBtns {
          display: flex;
          gap: 8px;
        }

        .btn {
          background: rgba(255, 255, 255, 0.92);
          color: #053b2e;
          border: none;
          border-radius: 12px;
          padding: 8px 12px;
          font-weight: 1000;
        }
        .hint {
          font-size: 11px;
          opacity: 0.9;
          text-align: center;
        }
        .msg {
          margin-top: 8px;
          font-size: 12px;
          opacity: 0.92;
          text-align: center;
        }

        .modalBg {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 60;
          padding: 16px;
        }
        .modal {
          width: min(560px, 100%);
          background: rgba(8, 20, 18, 0.96);
          border: 2px solid rgba(255, 255, 255, 0.16);
          border-radius: 18px;
          padding: 12px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
        }
        .modalTop {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }
        .modalTitle {
          font-weight: 1000;
        }
        .x {
          background: rgba(255, 255, 255, 0.12);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 12px;
          padding: 6px 10px;
          font-weight: 1000;
          cursor: pointer;
        }
        .modalCard {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 14px;
          padding: 12px;
        }
        .modalText {
          font-size: 14px;
          font-weight: 900;
          line-height: 1.35;
          white-space: pre-wrap;
        }
        .modalPlace {
          margin-top: 10px;
          font-size: 12px;
          opacity: 0.9;
          text-align: right;
          font-weight: 900;
        }
      `}</style>
    </main>
  );
}

/**
 * トランプ形（縦長）
 * ・全文は「カード内スクロール」で必ず読める
 * ・タップでモーダル全文も出せる
 */
function CardView({ card }) {
  if (!card) return null;

  return (
    <div
      style={{
        width: '100%',
        height: 150,
        borderRadius: 14,
        background: 'rgba(255,255,255,.92)',
        color: '#062b23',
        border: '2px solid rgba(0,0,0,.12)',
        padding: 10,
        boxShadow: '0 10px 18px rgba(0,0,0,.18)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        textAlign: 'left',
        userSelect: 'none',
        overflow: 'hidden',
      }}
      title={card.text}
    >
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          fontSize: 12,
          fontWeight: 1000,
          lineHeight: 1.2,
          whiteSpace: 'pre-wrap',
          paddingRight: 4,
        }}
      >
        {card.text}
      </div>

      <div style={{ fontSize: 11, fontWeight: 1000, opacity: 0.85, textAlign: 'right', marginTop: 8 }}>
        （{card.place}）
      </div>
    </div>
  );
}

function EmptyCard() {
  return (
    <div
      style={{
        width: '100%',
        height: 150,
        borderRadius: 14,
        border: '2px dashed rgba(255,255,255,.30)',
        background: 'rgba(0,0,0,.08)',
      }}
    />
  );
}

// 台札：数字ではなく「問題文カード」表示（digitは内部判定用）
const PileCard = forwardRef(function PileCard({ card, onOpen }, ref) {
  if (!card) {
    return (
      <div
        ref={ref}
        style={{
          width: 150,
          height: 150,
          borderRadius: 16,
          border: '2px dashed rgba(255,255,255,.35)',
          background: 'rgba(0,0,0,.10)',
        }}
      />
    );
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onOpen?.(card)}
      style={{
        width: 150,
        height: 150,
        borderRadius: 16,
        background: 'rgba(255,255,255,.95)',
        color: '#062b23',
        border: '2px solid rgba(0,0,0,.12)',
        padding: 10,
        boxShadow: '0 12px 22px rgba(0,0,0,.20)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        userSelect: 'none',
        cursor: 'pointer',
        textAlign: 'left',
      }}
      title={card.text}
    >
      <div style={{ fontSize: 10, fontWeight: 1000, opacity: 0.75 }}>台札（タップで全文）</div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          fontSize: 12,
          fontWeight: 1000,
          lineHeight: 1.2,
          whiteSpace: 'pre-wrap',
          paddingRight: 4,
          marginTop: 6,
        }}
      >
        {card.text}
      </div>

      <div style={{ fontSize: 11, fontWeight: 1000, opacity: 0.85, textAlign: 'right', marginTop: 8 }}>
        （{card.place}）
      </div>
    </button>
  );
});

function rectsOverlap(a, b) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

function DragCard({ card, index, piles, center, status, onPlay, onNoDrop, onCantPlay, onTap }) {
  const ref = useRef(null);
  const start = useRef({ x: 0, y: 0, t: 0 });
  const drag = useRef({ dx: 0, dy: 0, dragging: false });
  const [dragging, setDragging] = useState(false);

  function onPointerDown(e) {
    if (status !== 'playing') return;
    drag.current.dragging = true;
    setDragging(true);
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    drag.current.dx = 0;
    drag.current.dy = 0;
    ref.current?.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!drag.current.dragging) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    drag.current.dx = dx;
    drag.current.dy = dy;
    if (ref.current) ref.current.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function resetPos() {
    if (ref.current) ref.current.style.transform = 'translate(0px, 0px)';
    drag.current.dragging = false;
    setDragging(false);
  }

  function onPointerUp() {
    if (!drag.current.dragging) return;

    const moved = Math.hypot(drag.current.dx, drag.current.dy);
    const elapsed = Date.now() - start.current.t;

    const my = ref.current?.getBoundingClientRect?.();
    const r0 = piles[0]?.current?.getBoundingClientRect?.();
    const r1 = piles[1]?.current?.getBoundingClientRect?.();

    let dropped = -1;
    if (my && r0 && rectsOverlap(my, r0)) dropped = 0;
    else if (my && r1 && rectsOverlap(my, r1)) dropped = 1;

    resetPos();

    // ほぼ動かしてない＝タップ扱い（全文を見る）
    if (dropped === -1 && moved < 8 && elapsed < 350) {
      onTap?.();
      return;
    }

    if (dropped === -1) {
      onNoDrop?.();
      return;
    }

    const topDigit = center[dropped]?.digit ?? null;
    const d = clampDigit(card?.digit);
    if (!canPlay(d, topDigit)) {
      onCantPlay?.(dropped);
      return;
    }

    onPlay(dropped);
  }

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        touchAction: 'none',
        cursor: 'grab',
        zIndex: dragging ? 20 : 1,
        opacity: dragging ? 0.95 : 1,
        transform: 'translate(0px, 0px)',
      }}
      aria-label={`card-${index}`}
    >
      <CardView card={card} />
    </div>
  );
}
