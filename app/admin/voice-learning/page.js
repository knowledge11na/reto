// file: app/admin/voice-learning/page.js
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

const TAGS_STORY = [
  '東の海',
  '偉大なる航路突入',
  'アラバスタ',
  '空島',
  'DBF',
  'W7、エニエス・ロビー',
  'スリラーバーク',
  'シャボンディ諸島',
  '女ヶ島',
  'インペルダウン',
  '頂上戦争',
  '3D2Y',
  '魚人島',
  'パンクハザード',
  'ドレスローザ',
  'ゾウ',
  'WCI',
  '世界会議',
  'ワノ国',
  'エッグヘッド',
  'エルバフ',
];

const TAGS_OTHER = [
  'SBS',
  'ビブルカード',
  '扉絵',
  '技',
  '巻跨ぎ',
  'セリフ',
  '表紙',
  'サブタイトル',
  'その他',
];

function shuffle(arr) {
  const a = [...(arr || [])];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeText(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[、,。．.！!？?「」『』（）()［\[\]］【】]/g, '')
    .replace(/ー/g, '');
}

function typeLabel(t) {
  if (t === 'single') return '単一選択';
  if (t === 'multi') return '複数選択';
  if (t === 'text') return '記述';
  if (t === 'order') return '並び替え';
  return '問題';
}

function isCorrectAnswer(recognized, q) {
  const rec = normalizeText(recognized);
  if (!rec) return false;

  const correct = normalizeText(q?.correct_answer || '');
  const alts = Array.isArray(q?.alt_answers) ? q.alt_answers : [];
  const altNorm = alts.map((a) => normalizeText(a));

  if (correct && rec === correct) return true;
  if (altNorm.includes(rec)) return true;

  // ゆるめ：部分一致（短すぎる場合はやめる）
  if (rec.length >= 3) {
    if (correct && correct.includes(rec)) return true;
    if (correct && rec.includes(correct)) return true;
    for (const a of altNorm) {
      if (!a) continue;
      if (a.includes(rec) || rec.includes(a)) return true;
    }
  }
  return false;
}

function speakUtterance(text, opts = {}) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve();

    const synth = window.speechSynthesis;
    if (!synth) return resolve();

    const u = new SpeechSynthesisUtterance(text);
    u.rate = typeof opts.rate === 'number' ? opts.rate : 1.0;
    u.pitch = typeof opts.pitch === 'number' ? opts.pitch : 1.0;
    u.volume = typeof opts.volume === 'number' ? opts.volume : 1.0;
    u.lang = opts.lang || 'ja-JP';

    u.onend = () => resolve();
    u.onerror = () => resolve();

    synth.speak(u);
  });
}

function cancelSpeech() {
  if (typeof window === 'undefined') return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  try {
    synth.cancel();
  } catch {}
}

export default function AdminVoiceLearningPage() {
  // 出題元（承認済み）
  const [allApproved, setAllApproved] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState('');

  // 出題モード
  const [poolMode, setPoolMode] = useState('all');
  const [selectedType, setSelectedType] = useState('single');
  const [selectedTag, setSelectedTag] = useState('');

  // 学習モード
  const [learnMode, setLearnMode] = useState('read'); // read / answer

  // 音声設定
  const [speechRate, setSpeechRate] = useState(1.0);

  // ★追加：答えを読むまでの秒数（開始前に設定）
  const [revealSeconds, setRevealSeconds] = useState(5);

  // 進行
  const [deck, setDeck] = useState([]);
  const [idx, setIdx] = useState(0);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle/reading/answering/revealing
  const [statusMsg, setStatusMsg] = useState('');

  // 音声回答
  const [micSupported, setMicSupported] = useState(false);
  const [heard, setHeard] = useState('');
  const [judge, setJudge] = useState(null); // null / true / false
  const recognitionRef = useRef(null);

  // タイマー管理
  const timersRef = useRef([]);

  const current = deck[idx] || null;

  // Web Speech API の対応チェック
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setMicSupported(!!SR);
  }, []);

  // 承認済み問題取得
  const loadApproved = async () => {
    setLoading(true);
    setLoadErr('');
    try {
      const res = await fetch('/api/admin/questions?status=approved', {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || '取得に失敗しました');

      const qs = Array.isArray(data.questions) ? data.questions : [];
      setAllApproved(qs);
      setStatusMsg(`承認済み問題を ${qs.length} 件読み込みました`);
    } catch (e) {
      console.error(e);
      setLoadErr(e.message || '読み込みに失敗しました');
      setAllApproved([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApproved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredPool = useMemo(() => {
    let pool = allApproved;

    if (poolMode === 'byType') {
      pool = pool.filter((q) => (q.question_type || q.type) === selectedType);
    } else if (poolMode === 'byTag') {
      if (selectedTag) {
        pool = pool.filter((q) => {
          const tags = Array.isArray(q.tags) ? q.tags : [];
          return tags.includes(selectedTag);
        });
      } else {
        pool = [];
      }
    }

    return pool;
  }, [allApproved, poolMode, selectedType, selectedTag]);

  const clearTimers = () => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  };

  const stopRecognition = () => {
    try {
      const rec = recognitionRef.current;
      if (rec) rec.stop();
    } catch {}
    recognitionRef.current = null;
  };

  const hardStop = () => {
    clearTimers();
    stopRecognition();
    cancelSpeech();
    setRunning(false);
    setPhase('idle');
    setStatusMsg('停止しました');
  };

  useEffect(() => {
    return () => {
      clearTimers();
      stopRecognition();
      cancelSpeech();
    };
  }, []);

  const buildDeck = () => {
    const pool = filteredPool;
    const d = shuffle(pool);
    setDeck(d);
    setIdx(0);
    setHeard('');
    setJudge(null);
    setStatusMsg(
      d.length > 0 ? `デッキ作成：${d.length} 問` : '条件に合う問題がありません'
    );
    return d;
  };

  const ensureDeck = () => {
    if (deck.length > 0) return deck;
    return buildDeck();
  };

  const nextQuestion = async () => {
    clearTimers();
    stopRecognition();
    cancelSpeech();

    setHeard('');
    setJudge(null);

    if (deck.length === 0) {
      setStatusMsg('デッキが空です。先に「デッキ作成」を押してください。');
      setRunning(false);
      setPhase('idle');
      return;
    }

    const nextIdx = idx + 1;
    if (nextIdx >= deck.length) {
      setStatusMsg('最後の問題まで完了しました。');
      setRunning(false);
      setPhase('idle');
      return;
    }

    setIdx(nextIdx);
  };

  // ★ ここがメイン：形式→問題→（音声回答なら判定読み上げ）→ 指定秒数後に答え読み上げ（必ず）
  const runSequence = async (q) => {
    if (!q) return;

    setPhase('reading');
    setStatusMsg('読み上げ中…');

    const qType = q.question_type || q.type;
    const label = typeLabel(qType);

    // 1) 形式
    await speakUtterance(`問題形式は、${label}です。`, { rate: speechRate });

    // 2) 問題文
    const questionText = String(q.question || '').trim();
    if (questionText) {
      await speakUtterance(questionText, { rate: speechRate });
    } else {
      await speakUtterance('問題文が空です。', { rate: speechRate });
    }

    // 選択肢（単一/複数）
    const opts = Array.isArray(q.options) ? q.options : [];
    if ((qType === 'single' || qType === 'multi') && opts.length > 0) {
      await speakUtterance('選択肢を読み上げます。', { rate: speechRate });
      for (let i = 0; i < opts.length; i++) {
        const s = String(opts[i] || '').trim();
        if (!s) continue;
        await speakUtterance(`${i + 1}、${s}`, { rate: speechRate });
        await sleep(150);
      }
    }

    // 並び替え
    if (qType === 'order' && opts.length > 0) {
      await speakUtterance('並び替える要素を読み上げます。', { rate: speechRate });
      for (let i = 0; i < opts.length; i++) {
        const s = String(opts[i] || '').trim();
        if (!s) continue;
        await speakUtterance(`${i + 1}、${s}`, { rate: speechRate });
        await sleep(150);
      }
    }

    // 3) 音声回答モードならマイク開始
    if (learnMode === 'answer') {
      setPhase('answering');
      setStatusMsg('音声入力を待っています…');
      startRecognition(q);
    } else {
      setPhase('revealing');
      setStatusMsg(`答え待ち（${Math.max(1, Number(revealSeconds) || 5)}秒）…`);
    }

    // 4) 指定秒数後に答え読み上げ（最後に必ず読む）
    const waitMs = Math.max(1, Number(revealSeconds) || 5) * 1000;

    const t = setTimeout(async () => {
      // ここで止める
      stopRecognition();
      setPhase('revealing');

      // ★ 音声回答モードなら、正誤を音声で言ってから正解も読み上げる（再度）
      if (learnMode === 'answer') {
        const said = (heard || '').trim();
        const ok = said ? isCorrectAnswer(said, q) : false;

        setJudge(ok);

        if (!said) {
          await speakUtterance('回答を認識できませんでした。', { rate: speechRate });
        } else if (ok) {
          await speakUtterance('正解です。', { rate: speechRate });
        } else {
          await speakUtterance('不正解です。', { rate: speechRate });
        }
      }

      const ans = String(q.correct_answer || '').trim();
      const alt = Array.isArray(q.alt_answers) ? q.alt_answers : [];
      const altText = alt.length ? `。別解は、${alt.join('、')}。` : '';

      // ★ 正解は必ず読み上げ（音声回答後の“再度読み上げ”もこれで満たす）
      await speakUtterance(`正解は、${ans || '不明'}です${altText}`, {
        rate: speechRate,
      });

      setStatusMsg('次の問題へ進めます');
    }, waitMs);

    timersRef.current.push(t);
  };

  const startRecognition = (q) => {
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setStatusMsg('このブラウザは音声認識に対応していません（Chrome推奨）');
      return;
    }

    try {
      const rec = new SR();
      recognitionRef.current = rec;

      rec.lang = 'ja-JP';
      rec.interimResults = true;
      rec.continuous = false;

      let finalText = '';

      rec.onresult = (ev) => {
        let text = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          const transcript = r?.[0]?.transcript || '';
          text += transcript;
          if (r.isFinal) finalText += transcript;
        }
        const shown = (finalText || text || '').trim();
        setHeard(shown);

        // 即時にざっくり判定も更新（画面用）
        if (shown) setJudge(isCorrectAnswer(shown, q));
      };

      rec.onerror = (e) => {
        console.warn('SpeechRecognition error', e);
      };

      rec.onend = () => {
        // タイマーで止まる想定
      };

      rec.start();
    } catch (e) {
      console.error(e);
      setStatusMsg('音声認識の開始に失敗しました（マイク許可を確認してね）');
    }
  };

  const start = async () => {
    const d = ensureDeck();
    if (!d || d.length === 0) {
      setRunning(false);
      setPhase('idle');
      return;
    }
    setRunning(true);
    setStatusMsg('開始しました');
    await runSequence(d[0]);
  };

  // idx が変わったら、実行中なら自動で次へ
  useEffect(() => {
    if (!running) return;
    if (!current) return;

    clearTimers();
    stopRecognition();
    cancelSpeech();
    setHeard('');
    setJudge(null);

    runSequence(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const canAnswerMode = micSupported;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-50">♬ 音声学習モード</h1>
        <Link
          href="/admin"
          className="text-xs px-3 py-1 rounded bg-slate-800 border border-slate-600 text-slate-100 hover:bg-slate-700"
        >
          ← 管理者ホーム
        </Link>
      </div>

      <section className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadApproved}
            disabled={loading}
            className="px-3 py-2 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-sm font-bold text-white"
          >
            {loading ? '読み込み中…' : '承認済み問題を再読み込み'}
          </button>

          <div className="text-xs text-slate-300">
            読み込み件数：
            <span className="font-bold text-slate-50"> {allApproved.length}</span>
          </div>

          <div className="ml-auto text-xs text-slate-400">
            ※ 音声はブラウザの読み上げ機能を使用（端末の音量に注意）
          </div>
        </div>

        {loadErr && <div className="text-xs text-rose-300">{loadErr}</div>}
      </section>

      {/* 出題条件 */}
      <section className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-3">
        <h2 className="text-sm font-bold text-slate-50">出題条件</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <label className="space-y-1">
            <div className="text-slate-300">出題プール</div>
            <select
              className="w-full px-2 py-2 rounded bg-slate-800 border border-slate-600 text-slate-50"
              value={poolMode}
              onChange={(e) => setPoolMode(e.target.value)}
              disabled={running}
            >
              <option value="all">全ジャンル（承認済み）シャッフル</option>
              <option value="byType">形式指定シャッフル</option>
              <option value="byTag">タグ指定シャッフル</option>
            </select>
          </label>

          <label className="space-y-1">
            <div className="text-slate-300">形式（形式指定のとき）</div>
            <select
              className="w-full px-2 py-2 rounded bg-slate-800 border border-slate-600 text-slate-50"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              disabled={running || poolMode !== 'byType'}
            >
              <option value="single">単一選択</option>
              <option value="multi">複数選択</option>
              <option value="text">記述</option>
              <option value="order">並び替え</option>
            </select>
          </label>

          <label className="space-y-1">
            <div className="text-slate-300">タグ（タグ指定のとき）</div>
            <select
              className="w-full px-2 py-2 rounded bg-slate-800 border border-slate-600 text-slate-50"
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              disabled={running || poolMode !== 'byTag'}
            >
              <option value="">（選択してください）</option>
              {[...TAGS_STORY, ...TAGS_OTHER].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={buildDeck}
            disabled={running}
            className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold"
          >
            デッキ作成（シャッフル）
          </button>

          <div className="text-slate-300">
            デッキ：<span className="font-bold text-slate-50">{deck.length}</span> 問
            {deck.length > 0 && (
              <>
                {' '}
                / 現在：<span className="font-bold text-slate-50">{idx + 1}</span> 問目
              </>
            )}
          </div>

          <div className="ml-auto text-slate-400">
            条件一致：
            <span className="text-slate-50 font-bold"> {filteredPool.length}</span> 件
          </div>
        </div>
      </section>

      {/* 学習モード */}
      <section className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-3">
        <h2 className="text-sm font-bold text-slate-50">学習モード</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
          <label className="space-y-1">
            <div className="text-slate-300">モード</div>
            <select
              className="w-full px-2 py-2 rounded bg-slate-800 border border-slate-600 text-slate-50"
              value={learnMode}
              onChange={(e) => setLearnMode(e.target.value)}
              disabled={running}
            >
              <option value="read">読み上げだけ</option>
              <option value="answer" disabled={!canAnswerMode}>
                音声で答える（マイク認識）
              </option>
            </select>
            {!canAnswerMode && (
              <div className="text-[10px] text-amber-200">
                ※ このブラウザは音声認識に非対応です（Chrome推奨）
              </div>
            )}
          </label>

          <label className="space-y-1">
            <div className="text-slate-300">答えまでの秒数（開始前）</div>
            <input
              type="number"
              min="1"
              max="60"
              value={revealSeconds}
              onChange={(e) => setRevealSeconds(Number(e.target.value))}
              disabled={running}
              className="w-full px-2 py-2 rounded bg-slate-800 border border-slate-600 text-slate-50"
            />
            <div className="text-[10px] text-slate-400">
              ※ 問題文を読み終わってからこの秒数で答えを読み上げます
            </div>
          </label>

          <label className="space-y-1">
            <div className="text-slate-300">読み上げ速度</div>
            <input
              type="range"
              min="0.7"
              max="1.3"
              step="0.05"
              value={speechRate}
              onChange={(e) => setSpeechRate(Number(e.target.value))}
              disabled={running}
              className="w-full"
            />
            <div className="text-slate-200">rate: {speechRate.toFixed(2)}</div>
          </label>

          <div className="space-y-1">
            <div className="text-slate-300">操作</div>
            <div className="flex gap-2 flex-wrap">
              {!running ? (
                <button
                  type="button"
                  onClick={start}
                  className="px-3 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white font-bold"
                >
                  ▶ 開始
                </button>
              ) : (
                <button
                  type="button"
                  onClick={hardStop}
                  className="px-3 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold"
                >
                  ■ 停止
                </button>
              )}

              <button
                type="button"
                onClick={async () => {
                  if (!current) return;
                  clearTimers();
                  stopRecognition();
                  cancelSpeech();
                  await runSequence(current);
                }}
                disabled={!current}
                className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white font-bold disabled:opacity-60"
              >
                🔁 もう一度
              </button>

              <button
                type="button"
                onClick={nextQuestion}
                disabled={!running}
                className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold disabled:opacity-60"
              >
                ⏭ 次の問題
              </button>
            </div>
          </div>
        </div>

        {statusMsg && (
          <div className="text-xs text-slate-200 bg-slate-800 border border-slate-600 rounded p-2">
            {statusMsg}
          </div>
        )}
      </section>

      {/* 現在の問題表示 */}
      <section className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-2">
        <h2 className="text-sm font-bold text-slate-50">現在の問題</h2>

        {!current ? (
          <div className="text-xs text-slate-400">
            デッキを作成して開始してください。
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-slate-300">
              #{current.id} / 形式：
              <span className="text-slate-50 font-bold">
                {' '}
                {typeLabel(current.question_type || current.type)}
              </span>
              {Array.isArray(current.tags) && current.tags.length > 0 && (
                <>
                  {' '}
                  / タグ：
                  <span className="text-slate-50 font-bold">
                    {' '}
                    {current.tags.join('、')}
                  </span>
                </>
              )}
            </div>

            <div className="text-sm text-slate-50 whitespace-pre-wrap leading-relaxed">
              {current.question}
            </div>

            {Array.isArray(current.options) && current.options.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {current.options.map((o, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 rounded bg-slate-800 border border-slate-600 text-xs text-slate-50"
                  >
                    {i + 1}. {o}
                  </span>
                ))}
              </div>
            )}

            <div className="text-xs text-amber-200">
              正解：{current.correct_answer}
              {Array.isArray(current.alt_answers) &&
                current.alt_answers.length > 0 && (
                  <span> / 別解：{current.alt_answers.join('、')}</span>
                )}
            </div>

            {learnMode === 'answer' && (
              <div className="bg-slate-800 border border-slate-600 rounded p-2 space-y-1">
                <div className="text-xs text-slate-300">
                  マイク入力：
                  <span className="text-slate-50 font-bold">
                    {' '}
                    {heard || '（未検出）'}
                  </span>
                </div>
                <div className="text-xs">
                  判定：
                  {heard ? (
                    judge === true ? (
                      <span className="ml-2 text-emerald-300 font-bold">
                        正解っぽい
                      </span>
                    ) : judge === false ? (
                      <span className="ml-2 text-rose-300 font-bold">
                        不正解っぽい
                      </span>
                    ) : (
                      <span className="ml-2 text-slate-300">判定中…</span>
                    )
                  ) : (
                    <span className="ml-2 text-slate-400">
                      （発話すると判定します）
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400">
                  ※ 音声認識は端末・環境で誤差があります（別解に入れると強くなります）
                </div>
              </div>
            )}

            <div className="text-[10px] text-slate-400">進行状態：{phase}</div>
          </div>
        )}
      </section>
    </div>
  );
}
