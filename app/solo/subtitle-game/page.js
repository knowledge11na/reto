// file: app/solo/subtitle-game/page.js
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

/**
 * =========================
 * 判定ルール（ユーザー指定）
 * =========================
 * ・「」や！や.などの記号の有無は問わない（中黒・は判定する）
 * ・（）の中の文字は無視する
 * ・半角全角は正誤判定に組み込まない
 * ・条件を満たす解答は全て正解となる
 * ・大文字小文字は問わない
 */

function stripParens(s) {
  if (!s) return '';
  return s.replace(/（[^）]*）|\([^)]*\)/g, '');
}

function normalizeForJudge(raw) {
  if (!raw) return '';
  let s = String(raw);

  // 1) 括弧内を無視
  s = stripParens(s);

  // 2) 全角/半角寄せ（可能な範囲）
  s = s.normalize('NFKC');

  // 3) 大文字小文字無視
  s = s.toLowerCase();

  // 4) 中黒「・」だけ保持、他の記号は削除
  const DOT = '・';
  s = s.replaceAll(DOT, '__DOT__');
  s = s.replace(/[\p{P}\p{S}]/gu, '');
  s = s.replaceAll('__DOT__', DOT);

  // 5) 空白削除
  s = s.replace(/\s+/g, '');

  return s;
}

function getFirstCharForClue(titleRaw) {
  const t = normalizeForJudge(titleRaw);
  return t ? t[0] : '';
}

function getLastCharForClue(titleRaw) {
  const t = normalizeForJudge(titleRaw);
  return t ? t[t.length - 1] : '';
}

function buildAnswersByContains(all, needleRaw) {
  const needle = normalizeForJudge(needleRaw);
  if (!needle) return [];
  return all.filter((it) => normalizeForJudge(it.title).includes(needle));
}

function matchAnyTitleByUserAnswer(allAnswers, userAnswerRaw) {
  const ua = normalizeForJudge(userAnswerRaw);
  if (!ua) return false;
  return allAnswers.some((ans) => normalizeForJudge(ans.title) === ua);
}

function sample(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomIndex(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const RULES = [
  { key: 'A', name: '① 最初と最後' },
  { key: 'B', name: '② 漢字を含む' },
  { key: 'C', name: '③ 前後から' },
  { key: 'M', name: 'ミックス' },
];

const DURATIONS = [
  { sec: 300, label: '5分' },
  { sec: 600, label: '10分' },
];

const REVEAL_MS = 3000;
const PENALTY_MS = 10000;

// bestの保存キー
function bestKey(ruleKey, durationSec) {
  return `subtitle_best_${ruleKey}_${durationSec}`;
}

function loadBest(ruleKey, durationSec) {
  if (typeof window === 'undefined') return 0;
  const v = localStorage.getItem(bestKey(ruleKey, durationSec));
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function saveBest(ruleKey, durationSec, score) {
  if (typeof window === 'undefined') return;
  const cur = loadBest(ruleKey, durationSec);
  if (score > cur) {
    localStorage.setItem(bestKey(ruleKey, durationSec), String(score));
    return true;
  }
  return false;
}

export default function SubtitleGamePage() {
  // data
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null);

  // settings
  const [rule, setRule] = useState('A'); // A/B/C/M
  const [durationSec, setDurationSec] = useState(300); // 5min default

  // run state
  const [phase, setPhase] = useState('ready'); // ready | playing | result
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [judgeFlash, setJudgeFlash] = useState(null); // { ok, msg }

  const [correctCount, setCorrectCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [streak, setStreak] = useState(0);

  // ★ reveal state（3秒答え表示）
  const [revealing, setRevealing] = useState(false);
  const revealTimerRef = useRef(null);

  // timer
  const [timeLeftMs, setTimeLeftMs] = useState(durationSec * 1000);
  const endAtRef = useRef(0);
  const timerIdRef = useRef(null);

  // bests display (localStorage)
  const [bests, setBests] = useState({}); // {`${rule}_${sec}`: best}

  const inputRef = useRef(null);

  // load Excel data via API
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setLoadErr(null);

        const r = await fetch('/api/subtitles', { cache: 'no-store' });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.ok) throw new Error(d.error || `load failed: ${r.status}`);

        const items = Array.isArray(d.items) ? d.items : [];
        items.sort((a, b) => a.no - b.no);

        if (!alive) return;
        setAll(items);
      } catch (e) {
        if (!alive) return;
        setLoadErr(e?.message || 'unknown error');
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // build kanji pool from loaded titles
  const kanjiPool = useMemo(() => {
    const set = new Set();
    for (const it of all) {
      const s = stripParens(it.title);
      const m = s.match(/\p{Script=Han}/gu);
      if (m) for (const ch of m) set.add(ch);
    }
    return Array.from(set);
  }, [all]);

  // load bests
  useEffect(() => {
    const obj = {};
    for (const rr of ['A', 'B', 'C', 'M']) {
      for (const dd of DURATIONS) {
        obj[`${rr}_${dd.sec}`] = loadBest(rr, dd.sec);
      }
    }
    setBests(obj);
  }, [phase]);

  // focus input
  useEffect(() => {
    if (phase === 'playing' && !revealing) inputRef.current?.focus?.();
  }, [phase, question, revealing]);

  // clear timers on unmount
  useEffect(() => {
    return () => {
      if (timerIdRef.current) clearInterval(timerIdRef.current);
      timerIdRef.current = null;
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    };
  }, []);

  function stopTimer() {
    if (timerIdRef.current) clearInterval(timerIdRef.current);
    timerIdRef.current = null;
  }

  function startTimer() {
    stopTimer();
    const now = Date.now();
    endAtRef.current = now + durationSec * 1000;
    setTimeLeftMs(durationSec * 1000);

    timerIdRef.current = setInterval(() => {
      const left = Math.max(0, endAtRef.current - Date.now());
      setTimeLeftMs(left);

      if (left <= 0) {
        stopTimer();
        finishGame();
      }
    }, 100);
  }

  // ★残り時間を減らす（間違い or スキップで -10秒）
  function applyPenaltyMs(ms) {
    endAtRef.current -= ms;
    const left = Math.max(0, endAtRef.current - Date.now());
    setTimeLeftMs(left);
    if (left <= 0) {
      stopTimer();
      finishGame();
      return true;
    }
    return false;
  }

  function makeQuestionFor(ruleKey) {
    if (!all.length) return null;

    if (ruleKey === 'A') {
      const it = sample(all);
      if (!it) return null;

      const start = getFirstCharForClue(it.title);
      const end = getLastCharForClue(it.title);

      const corrects = all.filter((x) => {
        return getFirstCharForClue(x.title) === start && getLastCharForClue(x.title) === end;
      });

      return { type: 'A', start, end, corrects };
    }

    if (ruleKey === 'B') {
      for (let t = 0; t < 40; t++) {
        const kanji = sample(kanjiPool.length ? kanjiPool : ['麦']);
        if (!kanji) continue;
        const corrects = buildAnswersByContains(all, kanji);
        if (corrects.length >= 1) return { type: 'B', kanji, corrects };
      }
      const kanji = kanjiPool[0] || '麦';
      return { type: 'B', kanji, corrects: buildAnswersByContains(all, kanji) };
    }

    if (ruleKey === 'C') {
      if (all.length < 3) return null;

      const i = pickRandomIndex(1, all.length - 2);
      const prev = all[i - 1];
      const mid = all[i];
      const next = all[i + 1];

      return {
        type: 'C',
        // ★話数はUIで出さないが、内部は持ってもOK（今回は不要なので持たない）
        prev: { start: getFirstCharForClue(prev.title), end: getLastCharForClue(prev.title) },
        next: { start: getFirstCharForClue(next.title), end: getLastCharForClue(next.title) },
        corrects: [mid],
      };
    }

    return null;
  }

  function newQuestion() {
    const pool = ['A', 'B', 'C'];
    const picked = rule === 'M' ? sample(pool) : rule;

    if (!picked) {
      setQuestion(null);
      setAnswer('');
      setJudgeFlash({ ok: false, msg: 'データ準備中…もう一回STARTしてね' });
      return;
    }

    const q = makeQuestionFor(picked);
    if (!q) {
      setQuestion(null);
      setAnswer('');
      setJudgeFlash({ ok: false, msg: '問題生成に失敗…もう一回STARTしてね' });
      return;
    }

    setQuestion(q);
    setAnswer('');
    setJudgeFlash(null);
  }

  function startGame() {
    if (!all.length) return;

    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = null;
    setRevealing(false);

    setCorrectCount(0);
    setAnsweredCount(0);
    setStreak(0);
    setPhase('playing');
    newQuestion();
    startTimer();
  }

  function finishGame() {
    setPhase('result');
    setRevealing(false);
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = null;
  }

  // result -> best update
  useEffect(() => {
    if (phase !== 'result') return;

    const improved = saveBest(rule, durationSec, correctCount);

    const obj = {};
    for (const rr of ['A', 'B', 'C', 'M']) {
      for (const dd of DURATIONS) obj[`${rr}_${dd.sec}`] = loadBest(rr, dd.sec);
    }
    setBests(obj);

    if (improved) {
      setJudgeFlash({ ok: true, msg: '🏆 自己ベスト更新！' });
      setTimeout(() => setJudgeFlash(null), 1500);
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function beginRevealThenNext() {
    setRevealing(true);

    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(() => {
      setRevealing(false);
      if (phase === 'playing') newQuestion();
    }, REVEAL_MS);
  }

  function doJudge() {
    if (!question || phase !== 'playing' || revealing) return;

    const user = answer;
    if (!normalizeForJudge(user)) {
      setJudgeFlash({ ok: false, msg: '入力が空だよ！' });
      setTimeout(() => setJudgeFlash(null), 650);
      return;
    }

    const corrects = question.corrects || [];
    const ok = matchAnyTitleByUserAnswer(corrects, user);

    setAnsweredCount((v) => v + 1);

    if (ok) {
      setCorrectCount((v) => v + 1);
      setStreak((v) => v + 1);
      setJudgeFlash({ ok: true, msg: '✅ 正解！' });
    } else {
      setStreak(0);
      // ★間違い：-10秒
      const ended = applyPenaltyMs(PENALTY_MS);
      if (ended) return;
      setJudgeFlash({ ok: false, msg: '❌ 不正解…（-10秒）' });
    }

    // ★答えを3秒表示してから次へ（正解でも不正解でも）
    beginRevealThenNext();
  }

  function doSkip() {
    if (!question || phase !== 'playing' || revealing) return;

    setAnsweredCount((v) => v + 1);
    setStreak(0);

    // ★スキップ：-10秒
    const ended = applyPenaltyMs(PENALTY_MS);
    if (ended) return;

    setJudgeFlash({ ok: false, msg: '⏭ スキップ（-10秒） 3秒答え表示' });

    // ★答えを3秒表示してから次へ
    beginRevealThenNext();
  }

  function formatMs(ms) {
    const s = Math.ceil(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  const timeLeftText = formatMs(timeLeftMs);
  const totalMs = durationSec * 1000;
  const progress = totalMs > 0 ? Math.max(0, Math.min(1, timeLeftMs / totalMs)) : 0;

  // Styles (ゲームっぽく)
  const card = {
    background: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    border: '1px solid rgba(0,0,0,0.08)',
    boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
    padding: 14,
  };

  const neon = {
    background: 'linear-gradient(135deg, rgba(30,136,229,0.18), rgba(0,188,212,0.12))',
    border: '1px solid rgba(13,71,161,0.20)',
  };

  const btn = (primary, disabled) => ({
    width: '100%',
    border: 'none',
    borderRadius: 16,
    padding: '12px 14px',
    fontWeight: 900,
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: primary ? 'linear-gradient(135deg, #1565c0, #1e88e5)' : 'rgba(227,242,253,0.95)',
    color: primary ? '#fff' : '#0d47a1',
    boxShadow: primary ? '0 10px 18px rgba(21,101,192,0.22)' : 'none',
    opacity: disabled ? 0.55 : 1,
  });

  const pill = (active) => ({
    borderRadius: 999,
    border: active ? '2px solid rgba(13,71,161,0.65)' : '1px solid rgba(0,0,0,0.15)',
    background: active ? 'rgba(227,242,253,0.95)' : 'rgba(255,255,255,0.75)',
    padding: '10px 12px',
    fontWeight: 900,
    cursor: 'pointer',
    color: '#0d47a1',
    whiteSpace: 'nowrap',
  });

  const small = { fontSize: 12, opacity: 0.85 };

  const ruleLabel = useMemo(() => {
    const r = RULES.find((x) => x.key === rule);
    return r ? r.name : rule;
  }, [rule]);

  const correctTitlesToShow = useMemo(() => {
    if (!question?.corrects) return [];
    // 表示用：元のタイトルをそのまま（括弧など含んでOK）
    return question.corrects.map((x) => x.title);
  }, [question]);

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: 14,
        background:
          'radial-gradient(1200px 600px at 20% 10%, rgba(255,255,255,0.75), transparent), radial-gradient(900px 500px at 80% 20%, rgba(0,188,212,0.18), transparent), linear-gradient(180deg, #bfe7ff, #e8f7ff)',
        color: '#0b1b2a',
      }}
    >
      <div style={{ maxWidth: 780, margin: '0 auto', display: 'grid', gap: 12 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 950, letterSpacing: 0.2 }}>サブタイチャレンジ</div>
            <div style={{ ...small }}>
              記号無視（ただし「・」は判定）／（）内無視／全角半角無視／大小無視
            </div>
          </div>
          <Link
            href="/"
            style={{
              textDecoration: 'none',
              background: 'rgba(255,255,255,0.88)',
              border: '1px solid rgba(0,0,0,0.12)',
              padding: '10px 12px',
              borderRadius: 14,
              fontWeight: 900,
              color: '#0d47a1',
              whiteSpace: 'nowrap',
            }}
          >
            ホームへ
          </Link>
        </div>

        {/* Load status */}
        <div style={{ ...card, ...neon }}>
          {loading ? (
            <div style={{ fontWeight: 900 }}>Excelから読み込み中…</div>
          ) : loadErr ? (
            <div>
              <div style={{ fontWeight: 950, color: '#b71c1c', fontSize: 16 }}>読み込み失敗</div>
              <div style={{ marginTop: 6, fontSize: 13 }}>{loadErr}</div>
              <div style={{ marginTop: 10, ...small }}>
                ✅ `data/subtitles.xlsx` があるか／`npm i xlsx` 済みか／Vercelへコミットされてるか確認してね
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <div style={{ fontWeight: 950 }}>収録：</div>
                <div style={{ fontWeight: 900 }}>{all.length} 件</div>
                <div style={{ marginLeft: 'auto', ...small }}>
                  今：<b>{ruleLabel}</b> ／ <b>{durationSec === 300 ? '5分' : '10分'}</b>
                </div>
              </div>

              {/* Timer bar (playing only) */}
              {phase === 'playing' && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={{ fontWeight: 950 }}>残り時間</div>
                    <div style={{ fontWeight: 950, fontSize: 18 }}>{timeLeftText}</div>
                  </div>
                  <div
                    style={{
                      height: 14,
                      borderRadius: 999,
                      background: 'rgba(13,71,161,0.10)',
                      border: '1px solid rgba(13,71,161,0.18)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.round(progress * 100)}%`,
                        borderRadius: 999,
                        background: 'linear-gradient(90deg, rgba(21,101,192,0.95), rgba(0,188,212,0.85))',
                        transition: 'width 80ms linear',
                      }}
                    />
                  </div>
                  <div style={{ ...small }}>
                    ※ 不正解 or スキップで <b>残り -10秒</b>（時間が0なら終了）
                  </div>
                </div>
              )}

              {/* stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <div style={{ ...card, padding: 10, background: 'rgba(255,255,255,0.85)' }}>
                  <div style={{ ...small }}>正解数</div>
                  <div style={{ fontWeight: 950, fontSize: 20 }}>{correctCount}</div>
                </div>
                <div style={{ ...card, padding: 10, background: 'rgba(255,255,255,0.85)' }}>
                  <div style={{ ...small }}>解答数</div>
                  <div style={{ fontWeight: 950, fontSize: 20 }}>{answeredCount}</div>
                </div>
                <div style={{ ...card, padding: 10, background: 'rgba(255,255,255,0.85)' }}>
                  <div style={{ ...small }}>連続</div>
                  <div style={{ fontWeight: 950, fontSize: 20 }}>{streak}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Ready screen */}
        {phase === 'ready' && !loading && !loadErr && (
          <div style={{ ...card }}>
            <div style={{ fontWeight: 950, fontSize: 16, marginBottom: 10 }}>モード選択</div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {RULES.map((r) => (
                <button key={r.key} type="button" style={pill(rule === r.key)} onClick={() => setRule(r.key)}>
                  {r.name}
                </button>
              ))}
            </div>

            <div style={{ fontWeight: 950, fontSize: 16, marginBottom: 10 }}>時間</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {DURATIONS.map((d) => (
                <button
                  key={d.sec}
                  type="button"
                  style={{ ...pill(durationSec === d.sec), flex: 1 }}
                  onClick={() => setDurationSec(d.sec)}
                >
                  {d.label}モード
                </button>
              ))}
            </div>

            {/* bests */}
            <div style={{ ...card, ...neon, padding: 12 }}>
              <div style={{ fontWeight: 950, marginBottom: 8 }}>自己ベスト（正解数）</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {['A', 'B', 'C', 'M'].map((rk) => (
                  <div
                    key={rk}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto',
                      gap: 8,
                      alignItems: 'center',
                      background: 'rgba(255,255,255,0.70)',
                      border: '1px solid rgba(0,0,0,0.06)',
                      borderRadius: 14,
                      padding: '10px 12px',
                    }}
                  >
                    <div style={{ fontWeight: 950 }}>{RULES.find((x) => x.key === rk)?.name}</div>
                    <div style={{ ...small }}>
                      5分：<b>{bests[`${rk}_300`] ?? 0}</b>
                    </div>
                    <div style={{ ...small }}>
                      10分：<b>{bests[`${rk}_600`] ?? 0}</b>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <button type="button" style={btn(true, false)} onClick={startGame}>
                ▶ START（{ruleLabel} / {durationSec === 300 ? '5分' : '10分'}）
              </button>
              <div style={{ marginTop: 8, ...small }}>※ エンターキーでも判定できます（プレイ中）</div>
            </div>
          </div>
        )}

        {/* Playing */}
        {phase === 'playing' && (
          <div style={{ ...card }}>
            {!question ? (
              <div>問題を生成できません。</div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {/* question header */}
                <div style={{ ...card, ...neon, padding: 12 }}>
                  {question.type === 'A' && (
                    <>
                      <div style={{ fontWeight: 950, fontSize: 16 }}>
                        ①「{question.start}」で始まり「{question.end}」で終わるサブタイトルを答えよ
                      </div>
                      <div style={{ ...small, marginTop: 6 }}>※ 条件を満たすものは複数。どれでも正解。</div>
                    </>
                  )}

                  {question.type === 'B' && (
                    <>
                      <div style={{ fontWeight: 950, fontSize: 16 }}>②「{question.kanji}」が使われるサブタイトルを答えよ</div>
                      <div style={{ ...small, marginTop: 6 }}>※ 条件を満たすものは複数。どれでも正解。</div>
                    </>
                  )}

                  {question.type === 'C' && (
                    <>
                      <div style={{ fontWeight: 950, fontSize: 16 }}>③ 前後の情報から「間に入るサブタイトル」を答えよ</div>
                      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                        <div
                          style={{
                            background: 'rgba(255,255,255,0.70)',
                            border: '1px solid rgba(0,0,0,0.06)',
                            borderRadius: 14,
                            padding: '10px 12px',
                          }}
                        >
                          <div style={{ fontWeight: 950 }}>前</div>
                          <div style={{ marginTop: 2 }}>
                            先頭「<b>{question.prev.start}</b>」／末尾「<b>{question.prev.end}</b>」
                          </div>
                        </div>

                        <div
                          style={{
                            background: 'rgba(255,255,255,0.70)',
                            border: '1px solid rgba(0,0,0,0.06)',
                            borderRadius: 14,
                            padding: '10px 12px',
                          }}
                        >
                          <div style={{ fontWeight: 950 }}>後</div>
                          <div style={{ marginTop: 2 }}>
                            先頭「<b>{question.next.start}</b>」／末尾「<b>{question.next.end}</b>」
                          </div>
                        </div>
                      </div>
                      <div style={{ ...small, marginTop: 6 }}>※ ここは基本1つだけ正解。</div>
                    </>
                  )}

                  {rule === 'M' && (
                    <div style={{ marginTop: 10, ...small }}>
                      🎲 ミックス：今の問題タイプは <b>{question.type}</b>
                    </div>
                  )}
                </div>

                {/* input + actions */}
                <div style={{ display: 'grid', gap: 10 }}>
                  <input
                    ref={inputRef}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') doJudge();
                    }}
                    placeholder="サブタイトルを入力（そのまま）"
                    disabled={revealing}
                    style={{
                      width: '100%',
                      padding: '14px 12px',
                      fontSize: 16,
                      borderRadius: 16,
                      border: '1px solid rgba(0,0,0,0.18)',
                      outline: 'none',
                      background: revealing ? 'rgba(240,240,240,0.9)' : '#fff',
                      color: '#0b1b2a',
                      boxShadow: '0 8px 18px rgba(0,0,0,0.06)',
                    }}
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <button type="button" style={btn(true, revealing)} onClick={doJudge} disabled={revealing}>
                      判定！
                    </button>
                    <button type="button" style={btn(false, revealing)} onClick={doSkip} disabled={revealing}>
                      スキップ
                    </button>
                  </div>

                  {/* flash */}
                  {judgeFlash && (
                    <div
                      style={{
                        borderRadius: 16,
                        padding: '10px 12px',
                        border: judgeFlash.ok ? '2px solid rgba(46,125,50,0.35)' : '2px solid rgba(198,40,40,0.35)',
                        background: judgeFlash.ok ? 'rgba(46,125,50,0.10)' : 'rgba(198,40,40,0.10)',
                        fontWeight: 950,
                        textAlign: 'center',
                      }}
                    >
                      {judgeFlash.msg}
                    </div>
                  )}

                  {/* ★答え表示（3秒） */}
                  {revealing && (
                    <div
                      style={{
                        borderRadius: 16,
                        padding: '12px 12px',
                        border: '1px solid rgba(0,0,0,0.10)',
                        background: 'rgba(255,255,255,0.86)',
                      }}
                    >
                      <div style={{ fontWeight: 950, marginBottom: 8 }}>正解になり得る答え</div>
                      <div
                        style={{
                          maxHeight: 160,
                          overflow: 'auto',
                          display: 'grid',
                          gap: 6,
                        }}
                      >
                        {correctTitlesToShow.map((t, idx) => (
                          <div
                            key={`${idx}_${t}`}
                            style={{
                              padding: '8px 10px',
                              borderRadius: 12,
                              background: 'rgba(227,242,253,0.75)',
                              border: '1px solid rgba(13,71,161,0.10)',
                              fontWeight: 800,
                            }}
                          >
                            {t}
                          </div>
                        ))}
                      </div>
                      <div style={{ ...small, marginTop: 8 }}>3秒後に次の問題へ…</div>
                    </div>
                  )}

                  <button
                    type="button"
                    style={{
                      ...btn(false, false),
                      background: 'rgba(255,255,255,0.80)',
                      border: '1px solid rgba(0,0,0,0.12)',
                      color: '#37474f',
                    }}
                    onClick={() => {
                      stopTimer();
                      setPhase('ready');
                      setQuestion(null);
                      setAnswer('');
                      setJudgeFlash(null);
                      setRevealing(false);
                      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
                      revealTimerRef.current = null;
                      setTimeLeftMs(durationSec * 1000);
                    }}
                  >
                    やめる（記録しない）
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Result */}
        {phase === 'result' && (
          <div style={{ ...card }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontWeight: 1000, fontSize: 22 }}>⏱ 終了！</div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <div style={{ ...card, padding: 12, background: 'rgba(255,255,255,0.86)' }}>
                  <div style={{ ...small }}>ルール</div>
                  <div style={{ fontWeight: 950 }}>{ruleLabel}</div>
                </div>
                <div style={{ ...card, padding: 12, background: 'rgba(255,255,255,0.86)' }}>
                  <div style={{ ...small }}>時間</div>
                  <div style={{ fontWeight: 950 }}>{durationSec === 300 ? '5分' : '10分'}</div>
                </div>
                <div style={{ ...card, padding: 12, background: 'rgba(255,255,255,0.86)' }}>
                  <div style={{ ...small }}>正解数</div>
                  <div style={{ fontWeight: 1000, fontSize: 22 }}>{correctCount}</div>
                </div>
              </div>

              <div style={{ ...card, ...neon, padding: 12 }}>
                <div style={{ fontWeight: 950, marginBottom: 6 }}>自己ベスト</div>
                <div style={{ ...small }}>
                  このモードのベスト： <b>{loadBest(rule, durationSec)}</b>
                </div>
                {judgeFlash?.msg && <div style={{ marginTop: 8, fontWeight: 950 }}>{judgeFlash.msg}</div>}
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <button
                  type="button"
                  style={btn(true, false)}
                  onClick={() => {
                    setPhase('ready');
                    setQuestion(null);
                    setAnswer('');
                    setJudgeFlash(null);
                    setCorrectCount(0);
                    setAnsweredCount(0);
                    setStreak(0);
                    setRevealing(false);
                    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
                    revealTimerRef.current = null;
                    setTimeLeftMs(durationSec * 1000);
                  }}
                >
                  モード選択へ
                </button>

                <button
                  type="button"
                  style={btn(false, false)}
                  onClick={() => {
                    setPhase('ready');
                    setQuestion(null);
                    setAnswer('');
                    setJudgeFlash(null);
                    setCorrectCount(0);
                    setAnsweredCount(0);
                    setStreak(0);
                    setRevealing(false);
                    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
                    revealTimerRef.current = null;
                    setTimeLeftMs(durationSec * 1000);
                    setTimeout(() => startGame(), 50);
                  }}
                >
                  同じ設定でリトライ
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer note */}
        <div style={{ ...card, fontSize: 12, opacity: 0.9 }}>
          <div style={{ fontWeight: 950, marginBottom: 6 }}>遊び方</div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>5分/10分の制限時間で、正解数を競うタイムアタックです。</li>
            <li>不正解 or スキップで「残り時間 -10秒」になります。</li>
            <li>回答/スキップ後、正解になり得る答えを3秒表示して次の問題へ進みます。</li>
            <li>自己ベストはブラウザ（localStorage）に保存されます。</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
