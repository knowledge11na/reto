// file: meteorMode.js
// マルチ：隕石クラッシュ（押し合い・速度一定）専用 Socket イベント群
// server.js から setupMeteorMode(io) を呼ぶ

import fetch from 'node-fetch';

const meteorQueue = [];
const meteorRooms = new Map();

const METEOR_COUNT = 3;
const TICK_MS = 250;

// 持ち時間（先攻7:00 / 後攻6:30）
const HP_FIRST_MS = 7 * 60 * 1000; // 420000
const HP_SECOND_MS = 6 * 60 * 1000 + 30 * 1000; // 390000

// 直撃（タイムアップ）ペナルティ
const HIT_PENALTY_MS = 30000;

// ★中心→船までの基準（＝30秒）
const CENTER_MS = 30000;
// ★船↔船（全距離）＝60秒
const SHIP_TO_SHIP_MS = CENTER_MS * 2;

// ★開幕の3つだけ45秒
const OPENING_MS = 45000;

// ★連打などで二重発射を防ぐ
const ANSWER_COOLDOWN_MS = 150;

// ★② 隕石が2つ以上向かってきている側は「常時HPが減る」
// 速度一定のまま、2個以上なら毎tickぶんHPを削る（= 1秒あたり1秒減る）
const MULTI_INCOMING_DRAIN_MS_PER_TICK = TICK_MS; // ここを強くしたいなら TICK_MS * 2 とかにできる

function log(...args) {
  console.log('[meteor]', ...args);
}
function rid() {
  return Math.random().toString(36).slice(2, 10);
}
function normalize(str) {
  return (str || '').toString().trim().replace(/\s+/g, '').toLowerCase();
}
function otherSide(side) {
  return side === 'A' ? 'B' : 'A';
}

async function fetchMeteorQuestions() {
  const base =
    process.env.NEXT_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'http://localhost:3000';

  const url = `${base}/api/solo/questions?mode=meteor`;

  try {
    const res = await fetch(url, { headers: { 'cache-control': 'no-store' } });
    const data = await res.json().catch(() => ({}));

    if (!data?.ok || !Array.isArray(data.questions) || data.questions.length === 0) {
      log('fetchMeteorQuestions: no questions');
      return [];
    }

    return data.questions.map((q) => ({
      id: q.id ?? q.question_id ?? q.questionId ?? rid(),
      text: q.text || q.question || '',
      answerText: String(q.answerText ?? ''),
      altAnswers: Array.isArray(q.altAnswers) ? q.altAnswers.map(String) : [],
    }));
  } catch (e) {
    log('fetchMeteorQuestions error:', e);
    return [];
  }
}

function pickQuestion(questions) {
  if (!questions.length) return null;
  const idx = Math.floor(Math.random() * questions.length);
  return questions[idx];
}

function applyQuestionToMeteor(m, q) {
  m.qid = q.id;
  m.text = q.text;
  m.answerText = q.answerText;
  m.altAnswers = q.altAnswers;
}

function buildMeteor(questions, targetSide, startMs) {
  const q = pickQuestion(questions);
  if (!q) return null;

  const limitMs = typeof startMs === 'number' ? startMs : CENTER_MS;

  return {
    id: rid(),
    target: targetSide,
    remainingMs: limitMs,
    limitMs,

    // 表示
    text: q.text,

    // 判定用
    qid: q.id,
    answerText: q.answerText,
    altAnswers: q.altAnswers,
  };
}

function emitState(io, roomId) {
  const room = meteorRooms.get(roomId);
  if (!room) return;

  for (const [socketId, side] of Object.entries(room.socketSideMap)) {
    io.to(socketId).emit('meteor:state', {
      phase: room.phase,
      roomId,
      maxHpMs: room.maxHpMs,
      players: room.players,
      meteors: room.meteors.map((m) => ({
        id: m.id,
        target: m.target,
        remainingMs: m.remainingMs,
        limitMs: m.limitMs,
        text: m.text,
      })),
      youSide: side,
      message: room.message || '',
      winnerSide: room.winnerSide || null,
    });
  }
}

function endGame(io, roomId, winnerSide) {
  const room = meteorRooms.get(roomId);
  if (!room) return;

  room.phase = 'ended';
  room.winnerSide = winnerSide ?? null;
  room.message = winnerSide
    ? `勝者：${room.players[winnerSide]?.name || winnerSide}`
    : '終了';

  if (room.tick) clearInterval(room.tick);
  room.tick = null;

  for (const socketId of Object.keys(room.socketSideMap)) {
    io.to(socketId).emit('meteor:ended', {
      phase: room.phase,
      roomId,
      maxHpMs: room.maxHpMs,
      players: room.players,
      meteors: room.meteors.map((m) => ({
        id: m.id,
        target: m.target,
        remainingMs: m.remainingMs,
        limitMs: m.limitMs,
        text: m.text,
      })),
      youSide: room.socketSideMap[socketId],
      message: room.message || '',
      winnerSide: room.winnerSide || null,
    });
  }
}

// ★② 2個以上向かってきてる側のHPをtickごとに削る
function applyMultiIncomingDrain(io, roomId, room) {
  const countA = room.meteors.filter((m) => m.target === 'A').length;
  const countB = room.meteors.filter((m) => m.target === 'B').length;

  let aDead = false;
  let bDead = false;

  if (countA >= 2) {
    room.players.A.hpMs = Math.max(0, room.players.A.hpMs - MULTI_INCOMING_DRAIN_MS_PER_TICK);
    if (room.players.A.hpMs <= 0) aDead = true;
  }
  if (countB >= 2) {
    room.players.B.hpMs = Math.max(0, room.players.B.hpMs - MULTI_INCOMING_DRAIN_MS_PER_TICK);
    if (room.players.B.hpMs <= 0) bDead = true;
  }

  if (aDead && bDead) {
    endGame(io, roomId, null); // 同時に尽きたら引き分け扱い
    return true;
  }
  if (aDead) {
    endGame(io, roomId, 'B');
    return true;
  }
  if (bDead) {
    endGame(io, roomId, 'A');
    return true;
  }

  return false;
}

export function setupMeteorMode(io) {
  const broadcastQueue = () => {
    io.emit('meteor:queue-updated', { size: meteorQueue.length });
  };

  const createRoomAndMatch = async (p1, p2) => {
    const roomId = `meteor_${rid()}`;

    const questions = await fetchMeteorQuestions();
    if (!questions.length) {
      io.to(p1.socketId).emit('meteor:matched', { roomId: '', error: '問題取得に失敗しました' });
      io.to(p2.socketId).emit('meteor:matched', { roomId: '', error: '問題取得に失敗しました' });
      return;
    }

    const firstTarget = Math.random() < 0.5 ? 'A' : 'B';

    const room = {
      roomId,
      phase: 'playing',
      maxHpMs: HP_FIRST_MS, // 表示上の基準（フロントが最大7:00で統一表示するため）
      message: '',
      winnerSide: null,
      questions,
      players: {
        A: {
          name: p1.name,
          userId: p1.userId ?? null,
          hpMs: firstTarget === 'A' ? HP_FIRST_MS : HP_SECOND_MS,
          maxHpMs: firstTarget === 'A' ? HP_FIRST_MS : HP_SECOND_MS,
        },
        B: {
          name: p2.name,
          userId: p2.userId ?? null,
          hpMs: firstTarget === 'B' ? HP_FIRST_MS : HP_SECOND_MS,
          maxHpMs: firstTarget === 'B' ? HP_FIRST_MS : HP_SECOND_MS,
        },
      },
      socketSideMap: {
        [p1.socketId]: 'A',
        [p2.socketId]: 'B',
      },
      meteors: [],
      tick: null,
      lastAnswerAt: {},
    };

    // 開幕3つは45秒で firstTarget 側へ
    for (let i = 0; i < METEOR_COUNT; i++) {
      const m = buildMeteor(room.questions, firstTarget, OPENING_MS);
      if (m) room.meteors.push(m);
    }

    meteorRooms.set(roomId, room);

    io.to(p1.socketId).emit('meteor:matched', { roomId });
    io.to(p2.socketId).emit('meteor:matched', { roomId });

    room.tick = setInterval(() => {
      const r = meteorRooms.get(roomId);
      if (!r || r.phase !== 'playing') return;

      r.message = '';

      // ★隕石タイマー進行 & 直撃処理
      for (let i = 0; i < r.meteors.length; i++) {
        const m = r.meteors[i];
        m.remainingMs -= TICK_MS;

        if (m.remainingMs <= 0) {
          const target = m.target;

          r.players[target].hpMs = Math.max(0, r.players[target].hpMs - HIT_PENALTY_MS);
          r.message = `${r.players[target].name} に直撃！ -30秒`;

          if (r.players[target].hpMs <= 0) {
            endGame(io, roomId, otherSide(target));
            return;
          }

          // 直撃した隕石：同じ問題のまま、相手側へ「30秒スタート」で返す
          m.target = otherSide(target);
          m.limitMs = CENTER_MS;
          m.remainingMs = CENTER_MS;
        }
      }

      // ★② 2個以上来てる側のHPを常時ドレイン
      const endedByDrain = applyMultiIncomingDrain(io, roomId, r);
      if (endedByDrain) return;

      emitState(io, roomId);
    }, TICK_MS);

    emitState(io, roomId);
    log('room created:', roomId, 'firstTarget=', firstTarget);
  };

  io.on('connection', (socket) => {
    socket.on('meteor:join-queue', async (payload = {}) => {
      const name = payload.name || 'プレイヤー';
      const userId = payload.userId ?? null;

      const idx = meteorQueue.findIndex((p) => p.socketId === socket.id);
      if (idx >= 0) meteorQueue.splice(idx, 1);

      meteorQueue.push({ socketId: socket.id, userId, name });
      broadcastQueue();

      if (meteorQueue.length >= 2) {
        const p1 = meteorQueue.shift();
        const p2 = meteorQueue.shift();
        broadcastQueue();
        await createRoomAndMatch(p1, p2);
      }
    });

    socket.on('meteor:leave-queue', () => {
      const idx = meteorQueue.findIndex((p) => p.socketId === socket.id);
      if (idx >= 0) meteorQueue.splice(idx, 1);
      broadcastQueue();
    });

    socket.on('meteor:join-room', (payload = {}) => {
      const roomId = payload.roomId;
      const room = meteorRooms.get(roomId);
      if (!room) return;

      const userIdRaw = payload.userId ?? null;
      const nameRaw = payload.name ?? null;

      const userId = userIdRaw != null ? String(userIdRaw) : null;
      const nameNorm = nameRaw ? normalize(nameRaw) : null;

      if (room.socketSideMap[socket.id]) {
        emitState(io, roomId);
        return;
      }

      let side = null;

      if (userId) {
        const aId = room.players?.A?.userId != null ? String(room.players.A.userId) : null;
        const bId = room.players?.B?.userId != null ? String(room.players.B.userId) : null;
        if (aId && aId === userId) side = 'A';
        if (bId && bId === userId) side = 'B';
      }

      if (!side && nameNorm) {
        const aName = room.players?.A?.name ? normalize(room.players.A.name) : '';
        const bName = room.players?.B?.name ? normalize(room.players.B.name) : '';
        if (aName && aName === nameNorm) side = 'A';
        if (bName && bName === nameNorm) side = 'B';
      }

      if (side) {
        for (const [sid, sSide] of Object.entries(room.socketSideMap)) {
          if (sSide === side) delete room.socketSideMap[sid];
        }
        room.socketSideMap[socket.id] = side;

        log('rebind socket to room:', roomId, 'side=', side, 'socket=', socket.id);
        emitState(io, roomId);
      }
    });

    // 押し合い：速度一定（位置で時間が決まる）
    socket.on('meteor:answer', (payload = {}) => {
      const roomId = payload.roomId;
      const inputText = payload.text || '';
      const room = meteorRooms.get(roomId);
      if (!room || room.phase !== 'playing') return;

      const side = room.socketSideMap[socket.id];
      if (!side) return;

      const now = Date.now();
      const last = room.lastAnswerAt?.[socket.id] ?? 0;
      if (now - last < ANSWER_COOLDOWN_MS) return;
      room.lastAnswerAt[socket.id] = now;

      const nInput = normalize(inputText);

      const hitIndex = room.meteors.findIndex((m) => {
        if (m.target !== side) return false;
        const base = normalize(m.answerText);
        if (base && base === nInput) return true;
        const alts = Array.isArray(m.altAnswers) ? m.altAnswers : [];
        return alts.some((a) => normalize(a) === nInput);
      });

      if (hitIndex < 0) {
        room.message = `${room.players[side].name} の砲撃は外れた…`;
        emitState(io, roomId);
        return;
      }

      const m = room.meteors[hitIndex];

      // 反転時の相手側時間 = 60秒 -（今ターゲットまでの残り）
      let nextLimitMs = SHIP_TO_SHIP_MS - Math.max(0, m.remainingMs);
      if (nextLimitMs < 1000) nextLimitMs = 1000;

      const nextTarget = otherSide(side);

      // 打ち返し成功：問題は変わる
      const newQ = pickQuestion(room.questions);
      if (newQ) applyQuestionToMeteor(m, newQ);

      m.target = nextTarget;
      m.limitMs = nextLimitMs;
      m.remainingMs = nextLimitMs;

      room.message = `${room.players[side].name} が打ち返した！ → ${room.players[nextTarget].name}`;
      emitState(io, roomId);
    });

    socket.on('disconnect', () => {
      const idx = meteorQueue.findIndex((p) => p.socketId === socket.id);
      if (idx >= 0) {
        meteorQueue.splice(idx, 1);
        broadcastQueue();
      }

      for (const [roomId, room] of meteorRooms) {
        if (room?.socketSideMap?.[socket.id]) {
          delete room.socketSideMap[socket.id];
          log('socket unbound from room:', roomId, 'socket=', socket.id);
        }
      }
    });
  });
}
