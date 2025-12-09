// file: app/solo/dungeon/page.js
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import QuestionReviewAndReport from '@/components/QuestionReviewAndReport';

// ===== モンスター画像（背景透過PNG） =====
const MONSTERS = [
  { key: 'm1', src: '/solo_dungeon/IMG_0489.PNG' },
  { key: 'm2', src: '/solo_dungeon/IMG_0490.PNG' },
  { key: 'm3', src: '/solo_dungeon/IMG_0491.PNG' },
  { key: 'm4', src: '/solo_dungeon/IMG_0492.PNG' },
  { key: 'm5', src: '/solo_dungeon/IMG_0493.PNG' },
  { key: 'm6', src: '/solo_dungeon/IMG_0495.PNG' },
];

// 魔法陣画像（さっきくれたPNGを public/solo_dungeon/ 配下に置く）
const MAGIC_CIRCLE_IMG = '/solo_dungeon/magic_circle_red.png';

const QUESTION_TIME_MS = 30000;
const MAX_HP = 500;
const DAMAGE_PER_MISS = 100;
const HEAL_PER_10_CORRECT = 100;

const MAGIC_TYPES = ['fire', 'thunder', 'ice', 'dark', 'light'];

// ========== ユーティリティ ==========

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function norm(str) {
  return String(str ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

// ' と " を剥がす
function stripQuotes(s) {
  return String(s).trim().replace(/^['"]+|['"]+$/g, '');
}

function parseJsonArrayOrNull(value) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  try {
    const parsed = JSON.parse(t.replace(/'/g, '"'));
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // 無視
  }
  return null;
}

// 「ラン、デージー」「ラン/デージー」みたいなリスト書きを配列にする
function splitListLikeText(value) {
  if (!value) return [];
  return String(value)
    .split(/[、，,／/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ==== battle 側っぽいヘルパ ====

// options をいろいろなキーから拾う
function getBaseOptions(q) {
  if (!q) return [];

  // すでに配列で来ているパターン
  if (Array.isArray(q.options)) return [...q.options];
  if (Array.isArray(q.choices)) return [...q.choices];
  if (Array.isArray(q.options_json)) return [...q.options_json];

  // 文字列JSONパターン
  if (typeof q.options_json === 'string') {
    const t = q.options_json.trim();
    if (t) {
      // まず JSON として読む
      const arr = parseJsonArrayOrNull(t);
      if (arr) return arr;

      // ダメなら「ラン,デージー」形式として読む
      const list = splitListLikeText(t);
      if (list.length) return list;
    }
  }

  // どうしても options が無い場合、correct_answer から候補を作る
  if (typeof q.correct_answer === 'string') {
    const t = q.correct_answer.trim();
    const arrJson = parseJsonArrayOrNull(t);
    if (arrJson && arrJson.length) return arrJson;
    const list = splitListLikeText(t);
    if (list.length) return list;
  }

  return [];
}

// multi 用：正解配列（文字列の配列）を「とにかく全部」拾う
function getCorrectArrayFlexible(raw) {
  if (!raw) return [];

  const textCandidates = [];

  const pushTextArray = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((v) => {
      if (v != null && String(v).trim() !== '') {
        textCandidates.push(String(v));
      }
    });
  };

  // 1) すでに配列で入っているパターン
  pushTextArray(raw.correct);
  pushTextArray(raw.correctAnswers);
  pushTextArray(raw.correct_answers);

  // 2) JSON文字列から配列
  [
    parseJsonArrayOrNull(raw.correct),
    parseJsonArrayOrNull(raw.correct_answer),
    parseJsonArrayOrNull(raw.correctAnswers_json),
    parseJsonArrayOrNull(raw.correct_answers_json),
  ].forEach((arr) => pushTextArray(arr));

  // 3) テキスト系 fallback（answerText / correct_answer のリスト書き）
  if (typeof raw.answerText === 'string') {
    pushTextArray(splitListLikeText(raw.answerText));
  }
  if (typeof raw.correct_answer === 'string') {
    const t = raw.correct_answer.trim();
    if (t.startsWith('[')) {
      const arr = parseJsonArrayOrNull(t);
      pushTextArray(arr);
    } else {
      pushTextArray(splitListLikeText(t));
    }
  }

  // 4) 正規化して重複排除
  const seen = new Set();
  const result = [];
  textCandidates.forEach((t) => {
    const s = stripQuotes(t);
    const n = norm(s);
    if (!n || seen.has(n)) return;
    seen.add(n);
    result.push(s);
  });

  return result;
}

// APIレスポンス → 内部形式
function normalizeQuestionFromApi(raw) {
  const id = raw.id ?? raw.question_id ?? raw.questionId ?? Date.now();
  const text = raw.question_text || raw.question || raw.text || '';

  const baseChoices = getBaseOptions(raw);
  const choices =
    baseChoices.length > 0
      ? baseChoices.map((v) => String(v))
      : ['A', 'B', 'C', 'D']; // ここには通常来ないはず

  const correctTextsRaw = getCorrectArrayFlexible(raw);
  const correctTexts =
    correctTextsRaw.length > 0
      ? correctTextsRaw.map((t) => stripQuotes(t))
      : choices.length
      ? [choices[0]]
      : [];

  const correctNormSet = new Set(correctTexts.map((t) => norm(t)));

  // 表示用の選択肢はシャッフル
  const shuffledChoices = shuffle(choices);

  return {
    id,
    text,
    choices: shuffledChoices,
    correctTexts,
    correctNormSet,
  };
}

// multi 判定：テキスト集合が一致したら正解
function isMultiCorrect(question, selectedIndexes) {
  if (!question) return false;
  const correct = question.correctTexts || [];
  if (!correct.length) return false;

  const selected = Array.from(selectedIndexes || []);
  if (!selected.length) return false;

  const userTexts = selected.map((i) => question.choices[i]);

  const toNormSorted = (arr) =>
    Array.from(new Set(arr.map((v) => norm(v)))).sort();

  const ua = toNormSorted(userTexts);
  const ca = toNormSorted(correct);

  if (ua.length !== ca.length) return false;
  for (let i = 0; i < ua.length; i += 1) {
    if (ua[i] !== ca[i]) return false;
  }
  return true;
}

// ========== メインコンポーネント ==========

export default function DungeonPage() {
  const [monster, setMonster] = useState(MONSTERS[0]);
  const [monsterPool, setMonsterPool] = useState(MONSTERS);

  const [hp, setHp] = useState(MAX_HP);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);

  const [question, setQuestion] = useState(null);
  const [selectedIndexes, setSelectedIndexes] = useState(new Set());
  const selectedRef = useRef(new Set());

  const [timeLeftMs, setTimeLeftMs] = useState(QUESTION_TIME_MS);
  const [gameOver, setGameOver] = useState(false);
  const [resolving, setResolving] = useState(false);

  const [message, setMessage] = useState('');

  const [magicType, setMagicType] = useState('light');
  const [choiceFeedback, setChoiceFeedback] = useState(null); // { correctSelected:Set<number>, wrongSelected:Set<number> }

  const [monsterAttackEffect, setMonsterAttackEffect] = useState(false);
  const [monsterMagicCircles, setMonsterMagicCircles] = useState([]); 
  const [monsterDeath, setMonsterDeath] = useState(false);           
  const [playerDamageEffect, setPlayerDamageEffect] = useState(false); // ★ プレイヤーダメージ演出


  const [answerHistory, setAnswerHistory] = useState([]);

  const [bestScore, setBestScore] = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);

  const timerRef = useRef(null);
  const lastQuestionIdRef = useRef(null);
  const lastHandledQuestionIdRef = useRef(null); // 同じ問題の二重処理防止

  // ----- モンスター切り替え -----

  function resetMonsterPool() {
    const shuffled = shuffle(MONSTERS);
    setMonsterPool(shuffled);
    setMonster(shuffled[0]);
  }

  function nextMonster() {
    setMonsterPool((prev) => {
      const rest = prev.slice(1);
      if (rest.length === 0) {
        const reshuffled = shuffle(MONSTERS);
        setMonster(reshuffled[0]);
        return reshuffled;
      }
      setMonster(rest[0]);
      return rest;
    });
  }

  // ----- 初期ロード -----

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('dungeon_best_score');
        const n = raw ? Number(raw) : 0;
        if (!Number.isNaN(n) && n > 0) setBestScore(n);
      } catch {
        // 無視
      }
    }
    startNewGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startNewGame() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setHp(MAX_HP);
    setScore(0);
    setMisses(0);
    setGameOver(false);
    setMessage('');
    setMagicType('light');
    setChoiceFeedback(null);
    setMonsterAttackEffect(false);
    setMonsterMagicCircles([]);
    setAnswerHistory([]);
    lastHandledQuestionIdRef.current = null;

    const empty = new Set();
    setSelectedIndexes(empty);
    selectedRef.current = empty;

    resetMonsterPool();

    const q = await fetchNextQuestion(null);
    if (q) {
      setQuestion(q);
      lastQuestionIdRef.current = q.id;
      setTimeLeftMs(QUESTION_TIME_MS);
    } else {
      setGameOver(true);
      setMessage('問題の取得に失敗しました。');
    }
  }

  async function moveToNextQuestion() {
    if (gameOver) return;

    const empty = new Set();
    setSelectedIndexes(empty);
    selectedRef.current = empty;
    setChoiceFeedback(null);
    setMonsterAttackEffect(false);
    setMonsterMagicCircles([]);
    setMessage('');
    lastHandledQuestionIdRef.current = null;

    const q = await fetchNextQuestion(lastQuestionIdRef.current);
    if (q) {
      setQuestion(q);
      lastQuestionIdRef.current = q.id;
      setTimeLeftMs(QUESTION_TIME_MS);
    } else {
      setGameOver(true);
      setMessage('問題の取得に失敗しました。ゲームを終了します。');
    }
  }

  // ----- タイマー -----

  useEffect(() => {
    if (!question || gameOver) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setTimeLeftMs(QUESTION_TIME_MS);

    timerRef.current = setInterval(() => {
      setTimeLeftMs((prev) => {
        const next = prev - 1000;
        if (next <= 0) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          handleAttack(true); // 時間切れ → 1ミス扱い
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question && question.id, gameOver]);

  // ----- 問題取得 API -----

  async function fetchNextQuestion(prevId) {
    try {
      const res = await fetch('/api/solo/dungeon/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prevQuestionId: prevId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && (data.id || data.question)) {
          return normalizeQuestionFromApi(data);
        }
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  }

  // ----- 選択肢クリック -----

  function toggleSelect(index) {
    if (!question || resolving || gameOver) return;
    setSelectedIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      selectedRef.current = next;
      return next;
    });
  }

  // ----- 攻撃 or 時間切れ -----

  function handleAttack(fromTimeout) {
    if (!question || resolving || gameOver) return;

    // ★ 同じ問題IDを二重で処理しない
    if (lastHandledQuestionIdRef.current === question.id) {
      return;
    }
    lastHandledQuestionIdRef.current = question.id;

    setResolving(true);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const userSelected = fromTimeout ? new Set() : new Set(selectedRef.current);

    const userTexts = Array.from(userSelected)
      .sort((a, b) => a - b)
      .map((i) => question.choices[i]);

    const correctTexts = question.correctTexts || [];

    // 履歴（不備報告用）
    setAnswerHistory((prev) => [
      ...prev,
      {
        question_id: question.id,
        text: question.text || '',
        userAnswerText: userTexts.length
          ? userTexts.join(' / ')
          : fromTimeout
          ? '（時間切れ・未回答）'
          : '（未選択）',
        correctAnswerText: correctTexts.join(' / '),
      },
    ]);

    // 選択肢ごとの正誤（文字照合）
    const correctSelected = new Set();
    const wrongSelected = new Set();

    userSelected.forEach((idx) => {
      const text = question.choices[idx];
      if (question.correctNormSet.has(norm(text))) {
        correctSelected.add(idx);
      } else {
        wrongSelected.add(idx);
      }
    });

    setChoiceFeedback({ correctSelected, wrongSelected });

    // 完全一致判定
    const isCorrect =
      !fromTimeout && isMultiCorrect(question, userSelected);

    if (isCorrect) {
      // ===== 正解：魔法ぶっぱ（派手エフェクト） =====
      const type = pickRandom(MAGIC_TYPES);
      setMagicType(type);

      const circleCount = userSelected.size || 1;
      const circles = [];
      for (let i = 0; i < circleCount; i += 1) {
        circles.push({
          top: 20 + Math.random() * 40, // 20〜60%
          left: 15 + Math.random() * 70, // 15〜85%
        });
      }
      setMonsterMagicCircles(circles);

      // ★ 今回のスコアを先に計算
      const newScore = score + 1;
      const clearsMonster = newScore % 10 === 0;

      if (clearsMonster) {
        // モンスター撃破演出 & HP回復
        setHp((prevHp) =>
          Math.min(MAX_HP, prevHp + HEAL_PER_10_CORRECT)
        );
        setMonsterDeath(true);
        setMessage('10問正解！HPが100回復し、モンスターを撃破した！');
      } else {
        setMessage('魔法が命中！');
      }

      setScore(newScore);

      setTimeout(() => {
        setMonsterMagicCircles([]);
        setResolving(false);
        if (clearsMonster) {
          nextMonster();
          setMonsterDeath(false);
        }
        moveToNextQuestion();
      }, clearsMonster ? 950 : 700);
    } else {
      // ===== ミス / 時間切れ：モンスターの攻撃 =====
      setMonsterAttackEffect(true);
      setPlayerDamageEffect(true); // ★ プレイヤー側ダメージ演出オン
      setMisses((prev) => prev + 1);

      setHp((prevHp) => {
        const newHp = Math.max(prevHp - DAMAGE_PER_MISS, 0);
        const willGameOver = newHp <= 0;

        setMessage(
          fromTimeout
            ? '時間切れ！モンスターの反撃を受けた…'
            : 'ミス！モンスターの攻撃を受けた…'
        );

        setTimeout(() => {
          setMonsterAttackEffect(false);
          setPlayerDamageEffect(false); // ★ ダメージ演出オフ
          setResolving(false);
          if (!willGameOver) {
            moveToNextQuestion();
          }
        }, 750);

        if (willGameOver) {
          setGameOver(true);
        }

        return newHp;
      });
    }
  }


  // ----- 終了時 ベスト更新 -----

  useEffect(() => {
    if (!gameOver) return;
    if (typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem('dungeon_best_score');
      const oldBest = raw ? Number(raw) : 0;
      if (Number.isNaN(oldBest) || score > oldBest) {
        window.localStorage.setItem('dungeon_best_score', String(score));
        setBestScore(score);
        setIsNewRecord(score > 0);
      } else {
        setIsNewRecord(false);
        if (!Number.isNaN(oldBest)) setBestScore(oldBest);
      }
    } catch {
      // 無視
    }
  }, [gameOver, score]);

  const timeLeftSec = Math.ceil(timeLeftMs / 1000);
  const hpRatio = hp / MAX_HP;

  // ========== JSX ==========

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* ヘッダー */}
      <header className="w-full border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <div className="text-base sm:text-lg font-semibold">
            ダンジョン（ソロ）
          </div>
          <div className="flex gap-3 text-xs sm:text-sm">
            <Link
              href="/solo/dungeon/rules"
              className="text-indigo-300 hover:text-indigo-200 underline"
            >
              ルールを見る
            </Link>
            <Link
              href="/solo"
              className="text-teal-300 hover:text-teal-200 underline"
            >
              ソロゲームに戻る
            </Link>
          </div>
        </div>
      </header>

      {/* 本体 */}
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-4 sm:py-6">
        {/* ステータス */}
        <div className="mb-4 sm:mb-5 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1 min-w-[220px]">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span>HP</span>
              <span>
                {hp} / {MAX_HP}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-200"
                style={{
                  width: `${hpRatio * 100}%`,
                  backgroundColor:
                    hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.2 ? '#facc15' : '#fb7185',
                }}
              />
              {monsterAttackEffect && (
                <div className="pointer-events-none absolute inset-[-4px] flex items-center justify-center">
                  <div className="relative w-full h-full">
                    <div className="dungeon-scratch-line left-[25%]" />
                    <div className="dungeon-scratch-line left-[45%]" />
                    <div className="dungeon-scratch-line left-[65%]" />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-4 text-xs sm:text-sm">
            <div>
              スコア：
              <span className="font-semibold text-emerald-300">{score}</span>
              問
            </div>
            <div>
              ミス：
              <span className="font-semibold text-rose-300">{misses}</span>
              回
            </div>
            <div>
              残り時間：
              <span className="font-semibold text-sky-300">
                {timeLeftSec}秒
              </span>
            </div>
          </div>
        </div>

        {/* 問題文 */}
        <div className="mb-4 sm:mb-5 rounded-xl bg-slate-800/90 border border-slate-700 px-3 sm:px-4 py-3 sm:py-4">
          <div className="text-xs sm:text-sm text-slate-300 mb-1">問題</div>
          <div className="text-sm sm:text-base font-medium text-slate-50 min-h-[2.5rem] flex items-center whitespace-pre-wrap">
            {question ? question.text : '読み込み中...'}
          </div>
        </div>

        {/* モンスター + 杖 + 選択肢 */}
        <div className="rounded-2xl border border-slate-700 overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900/90 to-slate-800 shadow-lg mb-4 sm:mb-5">
          {/* モンスター */}
          <div
            className={
              `relative px-4 pt-5 pb-2 flex justify-center ` +
              (monsterDeath ? 'dungeon-monster-death ' : '') +
              (playerDamageEffect ? 'dungeon-player-damage ' : '')
            }
          >

            <img
              src={monster.src}
              alt="モンスター"
              className="w-[230px] sm:w-[260px] h-auto object-contain drop-shadow-[0_0_25px_rgba(0,0,0,0.8)]"
            />

            {/* 正解時：モンスター前のビーム＆魔方陣画像 */}
            {monsterMagicCircles.length > 0 && (
              <>
                <div className={`dungeon-magic-ray ${magicType}`} />
                {monsterMagicCircles.map((c, i) => (
                  <div
                    key={i}
                    className="dungeon-magic-circle-wrapper"
                    style={{
                      top: `${c.top}%`,
                      left: `${c.left}%`,
                      transform: `translate(-50%, -50%) scale(${c.scale}) rotate(${c.rotate}deg)`,
                      // ★ CSS 変数で色を渡す
                      '--dungeon-hue': `${c.hue}deg`,
                    }}
                  >
                    <img
                      src={MAGIC_CIRCLE_IMG}
                      alt=""
                      className="dungeon-magic-circle-img"
                    />
                  </div>
                ))}
              </>
            )}

          </div>

          {/* 杖ボタン */}
          <div className="pb-3 flex justify-center">
<button
  type="button"
  onClick={() => handleAttack(false)}
  disabled={resolving || gameOver || timeLeftMs <= 0}
  className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full ..."
  aria-label="攻撃する"
>
  <img
    src="/solo_dungeon/stick.png"
    alt="attack"
    className="w-20 h-20 object-contain pointer-events-none"
  />
</button>

          </div>

          {/* 選択肢 */}
          <div className="px-4 pb-4 sm:pb-6">
            {question && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {question.choices.map((choice, index) => {
                  const selected = selectedIndexes.has(index);
                  const isCorrectHit =
                    choiceFeedback?.correctSelected?.has(index);
                  const isWrongHit =
                    choiceFeedback?.wrongSelected?.has(index);

                  let stateClass = '';
                  if (isCorrectHit) stateClass = 'dungeon-choice-correct';
                  else if (isWrongHit) stateClass = 'dungeon-choice-wrong';
                  else if (selected)
                    stateClass =
                      'ring-2 ring-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.9)]';

                  return (
                    <button
                      key={index}
                      type="button"
                      disabled={resolving || gameOver}
                      onClick={() => toggleSelect(index)}
                      className={`relative w-full rounded-2xl border border-amber-400/90 bg-slate-900/95 shadow-md px-3 py-2 sm:px-4 sm:py-2.5 overflow-hidden text-left transition-transform ${
                        resolving || gameOver
                          ? 'opacity-80 cursor-not-allowed'
                          : 'hover:-translate-y-0.5'
                      } ${stateClass}`}
                    >
                      <span
                        className="absolute -inset-[6px] rounded-3xl ring-2 ring-purple-400/45 opacity-70 blur-[1px]"
                        aria-hidden="true"
                      />
                      <span
                        className="absolute inset-[3px] rounded-2xl border border-amber-500/80 border-dashed opacity-80"
                        aria-hidden="true"
                      />
                      <span className="relative z-10 block text-[11px] sm:text-sm font-bold text-amber-50 leading-snug whitespace-normal break-words">
                        {choice}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* メッセージ */}
        <div className="text-xs sm:text-sm text-slate-200 min-h-[1.5rem] text-center sm:text-left mb-2">
          {gameOver
            ? `ゲーム終了！スコア：${score}問（ミス ${misses}回）`
            : message ||
              '複数選択クイズ。正解だけ選んで杖ボタンで攻撃！10問ごとにHP100回復。'}
        </div>

        {/* リザルト + 不備報告 */}
{gameOver && (
  <section className="mt-4 max-w-3xl mx-auto">
    <div className="bg-slate-900 rounded-2xl shadow-lg border border-amber-300/70 p-4 sm:p-6 space-y-3 text-slate-50">
      <p className="text-base sm:text-lg font-semibold mb-2 text-amber-300">
        結果
      </p>

      <p className="text-sm sm:text-base">
        正解数:{' '}
        <span className="text-lg sm:text-xl font-extrabold text-emerald-300">
          {score}
        </span>{' '}
        問
      </p>
      <p className="text-sm sm:text-base">
        ミス:{' '}
        <span className="text-lg sm:text-xl font-extrabold text-rose-300">
          {misses}
        </span>{' '}
        回
      </p>

      <div className="mt-3 border-t border-slate-600 pt-3 text-xs sm:text-sm">
        <p className="text-slate-300">
          このブラウザでの最高記録:{' '}
          <span className="font-bold text-amber-200">
            {bestScore}
          </span>{' '}
          問
        </p>
        {isNewRecord && (
          <p className="text-xs text-amber-300 mt-1 font-semibold">
            🎉 自己ベスト更新！
          </p>
        )}
      </div>


              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={startNewGame}
                  className="px-4 py-2 rounded-full bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600"
                >
                  もう一度プレイ
                </button>
                <Link
                  href="/solo"
                  className="px-4 py-2 rounded-full border border-slate-300 bg-slate-50 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                >
                  ソロメニューへ戻る
                </Link>
                <Link
                  href="/"
                  className="px-4 py-2 rounded-full border border-slate-300 bg-slate-50 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                >
                  ホームへ戻る
                </Link>
              </div>
            </div>

            <div className="mt-6">
              <QuestionReviewAndReport
                questions={answerHistory}
                sourceMode="solo-dungeon"
              />
            </div>
          </section>
        )}
      </main>

      {/* エフェクト用グローバルCSS */}
      <style jsx global>{`
        @keyframes dungeon-scratch {
          0% {
            opacity: 0;
            transform: scaleX(0.2) rotate(45deg);
          }
          20% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: scaleX(1) rotate(45deg);
          }
        }
        .dungeon-scratch-line {
          position: absolute;
          top: -40%;
          width: 3px;
          height: 180%;
          background: linear-gradient(
            to bottom,
            rgba(248, 113, 113, 0.1),
            rgba(248, 113, 113, 0.95),
            rgba(248, 113, 113, 0.1)
          );
          box-shadow: 0 0 12px rgba(248, 113, 113, 0.9);
          transform-origin: top center;
          animation: dungeon-scratch 0.28s ease-out forwards;
        }

        /* 正解ボタン */
        @keyframes dungeon-choice-correct {
          0% {
            transform: scale(1);
            box-shadow: 0 0 0 rgba(250, 204, 21, 0.7);
          }
          50% {
            transform: scale(1.06);
            box-shadow: 0 0 26px rgba(250, 204, 21, 0.95);
          }
          100% {
            transform: scale(1.02);
            box-shadow: 0 0 14px rgba(250, 204, 21, 0.9);
          }
        }
        .dungeon-choice-correct {
          animation: dungeon-choice-correct 0.4s ease-out forwards;
        }

        /* 不正解ボタン */
        @keyframes dungeon-choice-wrong {
          0% {
            transform: translateX(0);
          }
          20% {
            transform: translateX(-3px);
          }
          40% {
            transform: translateX(3px);
          }
          60% {
            transform: translateX(-2px);
          }
          80% {
            transform: translateX(2px);
          }
          100% {
            transform: translateX(0);
          }
        }
        .dungeon-choice-wrong {
          animation: dungeon-choice-wrong 0.25s ease-out;
          box-shadow: 0 0 14px rgba(248, 113, 113, 0.9);
        }

        /* ビーム（炎・雷など） */
        @keyframes dungeon-magic-ray-anim {
          0% {
            opacity: 0;
            transform: scaleX(0.2);
          }
          20% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: scaleX(1.1);
          }
        }
        .dungeon-magic-ray {
          position: absolute;
          left: -5%;
          right: -5%;
          top: 45%;
          height: 180px;
          transform-origin: center;
          border-radius: 9999px;
          mix-blend-mode: screen;
          animation: dungeon-magic-ray-anim 0.6s ease-out forwards;
          pointer-events: none;
        }
        .dungeon-magic-ray.fire {
          background: radial-gradient(
              circle at 15% 50%,
              rgba(248, 113, 113, 0.4),
              transparent 60%
            ),
            radial-gradient(
              circle at 45% 50%,
              rgba(251, 146, 60, 0.55),
              transparent 60%
            ),
            radial-gradient(
              circle at 75% 50%,
              rgba(248, 113, 113, 0.6),
              transparent 65%
            );
        }
        .dungeon-magic-ray.thunder {
          background: radial-gradient(
              circle at 15% 50%,
              rgba(250, 204, 21, 0.4),
              transparent 60%
            ),
            radial-gradient(
              circle at 45% 50%,
              rgba(253, 224, 71, 0.6),
              transparent 60%
            ),
            radial-gradient(
              circle at 75% 50%,
              rgba(251, 191, 36, 0.65),
              transparent 65%
            );
        }
        .dungeon-magic-ray.ice {
          background: radial-gradient(
              circle at 15% 50%,
              rgba(56, 189, 248, 0.35),
              transparent 60%
            ),
            radial-gradient(
              circle at 45% 50%,
              rgba(96, 165, 250, 0.6),
              transparent 60%
            ),
            radial-gradient(
              circle at 75% 50%,
              rgba(56, 189, 248, 0.65),
              transparent 65%
            );
        }
        .dungeon-magic-ray.dark {
          background: radial-gradient(
              circle at 15% 50%,
              rgba(129, 140, 248, 0.45),
              transparent 60%
            ),
            radial-gradient(
              circle at 45% 50%,
              rgba(168, 85, 247, 0.7),
              transparent 60%
            ),
            radial-gradient(
              circle at 75% 50%,
              rgba(79, 70, 229, 0.7),
              transparent 65%
            );
        }
        .dungeon-magic-ray.light {
          background: radial-gradient(
              circle at 15% 50%,
              rgba(252, 211, 77, 0.4),
              transparent 60%
            ),
            radial-gradient(
              circle at 45% 50%,
              rgba(253, 224, 71, 0.7),
              transparent 60%
            ),
            radial-gradient(
              circle at 75% 50%,
              rgba(250, 250, 110, 0.75),
              transparent 65%
            );
        }

        /* 魔方陣画像 */
        @keyframes dungeon-magic-circle-anim {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.3);
          }
          20% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(1.2);
          }
        }
        .dungeon-magic-circle-wrapper {
          position: absolute;
          width: 110px;   /* ★ 小さめ */
          height: 110px;
          pointer-events: none;
          transform-origin: center;
          animation: dungeon-magic-circle-anim 0.6s ease-out forwards;
        }
        .dungeon-magic-circle-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          /* ★ hue-rotate で色をランダム化（--dungeon-hue は JSX でセット） */
          filter:
            hue-rotate(var(--dungeon-hue, 0deg))
            drop-shadow(0 0 22px rgba(255, 255, 255, 0.95));
        }
        /* ===== モンスター撃破：爆発して落下 ===== */
        @keyframes dungeon-monster-death-anim {
          0% {
            transform: translateY(0) scale(1);
            opacity: 1;
            filter: brightness(1);
          }
          40% {
            transform: translateY(-10px) scale(1.08);
            filter: brightness(1.2);
          }
          100% {
            transform: translateY(80px) scale(0.7);
            opacity: 0;
            filter: brightness(0.7);
          }
        }
        @keyframes dungeon-monster-explosion-anim {
          0% {
            transform: scale(0.2);
            opacity: 0.9;
          }
          100% {
            transform: scale(1.4);
            opacity: 0;
          }
        }
        .dungeon-monster-death img {
          animation: dungeon-monster-death-anim 0.8s ease-in forwards;
        }
        .dungeon-monster-death::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 220px;
          height: 220px;
          border-radius: 9999px;
          background: radial-gradient(
            circle,
            rgba(252, 211, 77, 0.95),
            rgba(248, 113, 113, 0.3),
            transparent 70%
          );
          transform: translate(-50%, -50%);
          pointer-events: none;
          animation: dungeon-monster-explosion-anim 0.6s ease-out forwards;
          mix-blend-mode: screen;
        }

        /* ===== プレイヤーがダメージを受けた時の画面揺れ ===== */
        @keyframes dungeon-player-damage-anim {
          0% {
            transform: translateX(0);
          }
          20% {
            transform: translateX(-6px);
          }
          40% {
            transform: translateX(6px);
          }
          60% {
            transform: translateX(-4px);
          }
          80% {
            transform: translateX(4px);
          }
          100% {
            transform: translateX(0);
          }
        }
        .dungeon-player-damage {
          animation: dungeon-player-damage-anim 0.35s ease-out;
        }

      `}</style>
    </div>
  );
}
