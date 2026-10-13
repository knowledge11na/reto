// file: server.js

import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import db from "./lib/db.js";
import { addBerriesByUserId } from "./lib/berries.js";
import { setupMeteorMode } from "./meteorMode.js";

const PORT = process.env.PORT || 4000;

// ------------------------------
// Express アプリ
// ------------------------------
const app = express();

app.use(express.json());

app.use(
  cors({
    origin: "*",
  })
);

// ヘルスチェチE��
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// 接続数
let onlineCount = 0;

app.get("/online-count", (req, res) => {
  res.json({ count: onlineCount });
});

// 404
app.use((req, res) => {
  res.status(404).send("Not Found");
});

// ------------------------------
// HTTP Server + Socket.IO
// ------------------------------
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

setupMeteorMode(io);

// ------------------------------
// 共送E
// ------------------------------

function log(...args) {
  console.log("[server]", ...args);
}

// レートから称号
function getRankName(rating) {
  if (rating >= 1800) return "海賊王";
  if (rating >= 1750) return "四皇";
  if (rating >= 1700) return "丁E��海";
  if (rating >= 1650) return "趁E��昁E;
  if (rating >= 1600) return "Level 新世界";
  if (rating >= 1550) return "Level 偉大なる航路";
  if (rating >= 1500) return "Level 東の海";
  return "海賊見習い";
}

// ========== レート�EチE��用キュー ==========
const rateQueue = [];

// ========== 通常バトル用ルーム状慁E==========
const rooms = new Map();

// ======================================================
// ☁Eフリーマッチ用ルーム
// ======================================================
//
// roomId:
//   4桁�E数孁E
//
// room:
// {
//   roomId,
//   hostSocketId,
//   players: Map(socketId -> player),
//   selectedGame,
//   createdAt
// }
// ======================================================

const freeRooms = new Map();

const FREE_ROOM_MAX_PLAYERS = 4;

// ------------------------------
// フリーマッチE��屋ID生�E
// ------------------------------

function generateFreeRoomId() {
  for (let i = 0; i < 100; i++) {
    const roomId = String(
      Math.floor(1000 + Math.random() * 9000)
    );

    if (!freeRooms.has(roomId)) {
      return roomId;
    }
  }

  return null;
}

// ------------------------------
// フリーマッチE��屋�E状態を作る
// ------------------------------

function makeFreeRoomPayload(room) {
  const players = Array.from(room.players.values()).map((player, index) => ({
    socketId: player.socketId,
    userId: player.userId,
    name: player.name,
    isHost: player.socketId === room.hostSocketId,
    playerNumber: index + 1,
  }));

  return {
    roomId: room.roomId,
    players,
    maxPlayers: FREE_ROOM_MAX_PLAYERS,
    selectedGame: room.selectedGame || null,
    hostSocketId: room.hostSocketId,
  };
}

// ------------------------------
// フリーマッチE��屋�E員へ状態送信
// ------------------------------

function broadcastFreeRoom(room) {
  if (!room) return;

  const payload = makeFreeRoomPayload(room);

  for (const player of room.players.values()) {
    io.to(player.socketId).emit("free:room-state", payload);
  }
}

// ------------------------------
// フリーマッチE��屋から削除
// ------------------------------

function removeSocketFromFreeRooms(socketId) {
  for (const [roomId, room] of freeRooms.entries()) {
    if (!room.players.has(socketId)) {
      continue;
    }

    const leavingPlayer =
      room.players.get(socketId);

    // ☁EHawkなどゲーム画面へ移動するため�E
    // Socket刁E��替え中なら、�Eレイヤー惁E��を残す
    if (
      leavingPlayer?.userId &&
      room.selectedGame
    ) {
      log(
        "free room socket preserved for game transfer:",
        roomId,
        leavingPlayer.name,
        socketId
      );

      continue;
    }

    room.players.delete(socketId);

    log(
      "free room player left:",
      roomId,
      leavingPlayer?.name,
      "remaining:",
      room.players.size
    );

    // 誰もいなくなったら部屋削除
    if (room.players.size === 0) {
      freeRooms.delete(roomId);

      log(
        "free room deleted:",
        roomId
      );

      continue;
    }

    // 部屋主が抜けたら次の人を部屋主にする
    if (
      room.hostSocketId ===
      socketId
    ) {
      const nextHost =
        Array.from(
          room.players.values()
        )[0];

      if (nextHost) {
        room.hostSocketId =
          nextHost.socketId;

        log(
          "free room host changed:",
          roomId,
          "->",
          nextHost.name
        );
      }
    }

    broadcastFreeRoom(room);
  }
}

// ======================================================
// DB ヘルパ�E
// ======================================================

// id でユーザー取征E
async function getUserById(id) {
  if (!id) return null;

  try {
    const row = await db.get(
      `
      SELECT
        id,
        username,
        display_name,
        rating,
        internal_rating
      FROM users
      WHERE id = $1
    `,
      [id]
    );

    return row || null;
  } catch (e) {
    log("getUserById error:", e);
    return null;
  }
}

// username / display_name でユーザー取征E
async function getUserForMatch(name) {
  if (!name) return null;

  try {
    const row = await db.get(
      `
      SELECT
        id,
        username,
        display_name,
        rating,
        internal_rating
      FROM users
      WHERE username = $1 OR display_name = $1
      LIMIT 1
    `,
      [name]
    );

    return row || null;
  } catch (e) {
    log("getUserForMatch error:", e);
    return null;
  }
}

// user_id からマイチ�Eム
async function getUserTeamByUserId(userId) {
  if (!userId) return [];

  try {
    const rows = await db.query(
      `
      SELECT
        ut.slot,
        ut.character_id,
        uc.stars,
        c.char_no,
        c.name,
        c.base_rarity
      FROM user_teams ut
      JOIN user_characters uc
        ON uc.user_id = ut.user_id
        AND uc.character_id = ut.character_id
      LEFT JOIN characters c
        ON c.id = ut.character_id
      WHERE ut.user_id = $1
      ORDER BY ut.slot ASC
    `,
      [userId]
    );

    return rows.map((row) => ({
      slot: row.slot,
      character_id: row.character_id,
      star: row.stars ?? 1,
      name: row.name || `キャラID:${row.character_id}`,
      rarity: row.base_rarity ?? 1,
      char_no: row.char_no ?? row.character_id,
      image_url: null,
    }));
  } catch (e) {
    log("getUserTeamByUserId error:", e);
    return [];
  }
}

// ユーザー取得�Eルパ�E
async function getUserFromPlayer(player) {
  const baseSelect = `
    SELECT
      id,
      username,
      display_name,
      rating,
      internal_rating,
      matches_played,
      wins,
      losses,
      current_streak,
      best_streak
    FROM users
  `;

  let user = null;

  if (player.userId != null) {
    try {
      user = await db.get(
        baseSelect + " WHERE id = $1",
        [player.userId]
      );

      if (user) {
        log(
          "getUserFromPlayer: found by id",
          player.userId,
          "->",
          user.username
        );

        return user;
      }
    } catch (e) {
      log("getUserFromPlayer error(by id):", e);
    }
  }

  if (player.name) {
    try {
      user = await db.get(
        baseSelect + " WHERE username = $1",
        [player.name]
      );

      if (user) {
        log(
          "getUserFromPlayer: found by username",
          player.name,
          "-> id",
          user.id
        );

        return user;
      }
    } catch (e) {
      log("getUserFromPlayer error(by name):", e);
    }
  }

  return null;
}

// ======================================================
// レート計箁E
// ======================================================

function eloChange(
  ratingSelf,
  ratingOpp,
  outcome,
  kFactor
) {
  const K = kFactor ?? 32;

  const expected =
    1 /
    (1 +
      Math.pow(
        10,
        (ratingOpp - ratingSelf) / 400
      ));

  let score = 0.5;

  if (outcome === "win") {
    score = 1;
  } else if (outcome === "lose") {
    score = 0;
  }

  return K * (score - expected);
}

// ======================================================
// 通常終亁E��ート更新
// ======================================================

async function updateRatingsNormalFinish(p0, p1) {
  log("updateRatingsNormalFinish called:", {
    p0UserId: p0.userId,
    p1UserId: p1.userId,
    p0Name: p0.name,
    p1Name: p1.name,
    p0Score: p0.score,
    p1Score: p1.score,
  });

  const user0 = await getUserFromPlayer(p0);
  const user1 = await getUserFromPlayer(p1);

  if (!user0 || !user1) {
    log("skip rating update: user not found");
    return;
  }

  const decideOutcome = (self, opp) => {
    if (self.score > opp.score) return "win";
    if (self.score < opp.score) return "lose";

    if (self.totalTimeMs < opp.totalTimeMs) {
      return "win";
    }

    if (self.totalTimeMs > opp.totalTimeMs) {
      return "lose";
    }

    return "draw";
  };

  const outcome0 = decideOutcome(p0, p1);
  const outcome1 = decideOutcome(p1, p0);

  const r0 =
    user0.internal_rating ??
    user0.rating ??
    1500;

  const r1 =
    user1.internal_rating ??
    user1.rating ??
    1500;

  let delta0 = eloChange(
    r0,
    r1,
    outcome0
  );

  let delta1 = eloChange(
    r1,
    r0,
    outcome1
  );

  const diff = Math.min(
    10,
    Math.abs(p0.score - p1.score)
  );

  const pointFactor = 1 + diff / 10;

  delta0 *= pointFactor;
  delta1 *= pointFactor;

  let newStreak0 =
    user0.current_streak ?? 0;

  let newStreak1 =
    user1.current_streak ?? 0;

  let wins0 =
    user0.wins ?? 0;

  let wins1 =
    user1.wins ?? 0;

  let losses0 =
    user0.losses ?? 0;

  let losses1 =
    user1.losses ?? 0;

  if (outcome0 === "win") {
    newStreak0 =
      (user0.current_streak ?? 0) + 1;

    newStreak1 = 0;

    wins0 += 1;
    losses1 += 1;
  } else if (outcome0 === "lose") {
    newStreak0 = 0;

    newStreak1 =
      (user1.current_streak ?? 0) + 1;

    wins1 += 1;
    losses0 += 1;
  } else {
    newStreak0 = 0;
    newStreak1 = 0;
  }

  if (outcome0 === "win") {
    delta0 += Math.min(
      newStreak0,
      10
    );
  }

  if (outcome1 === "win") {
    delta1 += Math.min(
      newStreak1,
      10
    );
  }

  const newInternal0 = r0 + delta0;
  const newInternal1 = r1 + delta1;

  const newRating0 =
    Math.round(newInternal0);

  const newRating1 =
    Math.round(newInternal1);

  const newBestStreak0 =
    Math.max(
      user0.best_streak ?? 0,
      newStreak0
    );

  const newBestStreak1 =
    Math.max(
      user1.best_streak ?? 0,
      newStreak1
    );

  const matches0 =
    (user0.matches_played ?? 0) + 1;

  const matches1 =
    (user1.matches_played ?? 0) + 1;

  const updateSql = `
    UPDATE users
    SET
      rating = $1,
      internal_rating = $2,
      matches_played = $3,
      wins = $4,
      losses = $5,
      current_streak = $6,
      best_streak = $7
    WHERE id = $8
  `;

  await db.run(updateSql, [
    newRating0,
    newInternal0,
    matches0,
    wins0,
    losses0,
    newStreak0,
    newBestStreak0,
    user0.id,
  ]);

  await db.run(updateSql, [
    newRating1,
    newInternal1,
    matches1,
    wins1,
    losses1,
    newStreak1,
    newBestStreak1,
    user1.id,
  ]);

  try {
    if (outcome0 === "win") {
      await addBerriesByUserId(
        user0.id,
        300,
        "レート戦勝利報酬"
      );
    } else if (outcome1 === "win") {
      await addBerriesByUserId(
        user1.id,
        300,
        "レート戦勝利報酬"
      );
    }
  } catch (e) {
    log(
      "addBerriesByUserId error:",
      e
    );
  }
}

// ======================================================
// 刁E��敗北
// ======================================================

async function updateRatingsDisconnectFinish(
  winner,
  loser
) {
  const userW =
    await getUserFromPlayer(winner);

  const userL =
    await getUserFromPlayer(loser);

  if (!userW || !userL) {
    log(
      "skip rating update (disconnect): user not found"
    );

    return;
  }

  const rW =
    userW.internal_rating ??
    userW.rating ??
    1500;

  const rL =
    userL.internal_rating ??
    userL.rating ??
    1500;

  let deltaW =
    eloChange(
      rW,
      rL,
      "win"
    );

  let deltaL =
    eloChange(
      rL,
      rW,
      "lose"
    );

  const newStreakW =
    (userW.current_streak ?? 0) + 1;

  const newStreakL = 0;

  const winsW =
    (userW.wins ?? 0) + 1;

  const winsL =
    userL.wins ?? 0;

  const lossesW =
    userW.losses ?? 0;

  const lossesL =
    (userL.losses ?? 0) + 1;

  deltaW += Math.min(
    newStreakW,
    10
  );

  const newInternalW =
    rW + deltaW;

  const newInternalL =
    rL + deltaL;

  const newRatingW =
    Math.round(newInternalW);

  const newRatingL =
    Math.round(newInternalL);

  const newBestStreakW =
    Math.max(
      userW.best_streak ?? 0,
      newStreakW
    );

  const newBestStreakL =
    Math.max(
      userL.best_streak ?? 0,
      newStreakL
    );

  const matchesW =
    (userW.matches_played ?? 0) + 1;

  const matchesL =
    (userL.matches_played ?? 0) + 1;

  const updateSql = `
    UPDATE users
    SET
      rating = $1,
      internal_rating = $2,
      matches_played = $3,
      wins = $4,
      losses = $5,
      current_streak = $6,
      best_streak = $7
    WHERE id = $8
  `;

  await db.run(updateSql, [
    newRatingW,
    newInternalW,
    matchesW,
    winsW,
    lossesW,
    newStreakW,
    newBestStreakW,
    userW.id,
  ]);

  await db.run(updateSql, [
    newRatingL,
    newInternalL,
    matchesL,
    winsL,
    lossesL,
    newStreakL,
    newBestStreakL,
    userL.id,
  ]);

  try {
    await addBerriesByUserId(
      userW.id,
      300,
      "レート戦勝利報酬(刁E��)"
    );
  } catch (e) {
    log(
      "addBerriesByUserId error:",
      e
    );
  }
}

// ======================================================
// レート�EチE��ング
// ======================================================

async function tryRateMatch() {
  log(
    "tryRateMatch, queue size:",
    rateQueue.length
  );

  if (rateQueue.length < 2) {
    return;
  }

  const first =
    rateQueue.shift();

  if (rateQueue.length === 0) {
    rateQueue.unshift(first);
    return;
  }

  if (rateQueue.length === 1) {
    const second =
      rateQueue.shift();

    await makeRoomAndNotify(
      first,
      second
    );

    return;
  }

  let bestIndex = 0;
  let bestDiff = Infinity;

  for (
    let i = 0;
    i < rateQueue.length;
    i++
  ) {
    const cand = rateQueue[i];

    const diff =
      Math.abs(
        (cand.rating ?? 1500) -
          (first.rating ?? 1500)
      );

    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }

  const second =
    rateQueue.splice(
      bestIndex,
      1
    )[0];

  await makeRoomAndNotify(
    first,
    second
  );
}

async function makeRoomAndNotify(a, b) {
  const roomId =
    "r-" +
    Date.now().toString(36) +
    "-" +
    Math.random()
      .toString(36)
      .slice(2, 8);

  const userA = a.userId
    ? await getUserById(a.userId)
    : await getUserForMatch(a.name);

  const userB = b.userId
    ? await getUserById(b.userId)
    : await getUserForMatch(b.name);

  const displayRatingA =
    typeof userA?.rating === "number"
      ? userA.rating
      : typeof a.rating === "number"
      ? a.rating
      : 1500;

  const ratingForTitleA =
    typeof userA?.internal_rating === "number"
      ? userA.internal_rating
      : displayRatingA;

  const titleA =
    getRankName(
      ratingForTitleA
    );

  const displayNameA =
    userA?.display_name ||
    userA?.username ||
    a.name ||
    "プレイヤーA";

  const displayRatingB =
    typeof userB?.rating === "number"
      ? userB.rating
      : typeof b.rating === "number"
      ? b.rating
      : 1500;

  const ratingForTitleB =
    typeof userB?.internal_rating === "number"
      ? userB.internal_rating
      : displayRatingB;

  const titleB =
    getRankName(
      ratingForTitleB
    );

  const displayNameB =
    userB?.display_name ||
    userB?.username ||
    b.name ||
    "プレイヤーB";

  const teamA =
    userA?.id
      ? await getUserTeamByUserId(
          userA.id
        )
      : [];

  const teamB =
    userB?.id
      ? await getUserTeamByUserId(
          userB.id
        )
      : [];

  io.to(a.socketId).emit(
    "rate:matched",
    {
      roomId,
      opponentName:
        displayNameB,
      opponentDisplayName:
        displayNameB,
      opponentDisplayRating:
        displayRatingB,
      opponentInternalRating:
        ratingForTitleB,
      opponentTitle:
        titleB,
      selfUserId:
        userA?.id ?? null,
      selfDisplayName:
        displayNameA,
      selfDisplayRating:
        displayRatingA,
      selfInternalRating:
        ratingForTitleA,
      selfTitle:
        titleA,
      selfTeam:
        teamA,
      opponentUserId:
        userB?.id ?? null,
      opponentTeam:
        teamB,
    }
  );

  io.to(b.socketId).emit(
    "rate:matched",
    {
      roomId,
      opponentName:
        displayNameA,
      opponentDisplayName:
        displayNameA,
      opponentDisplayRating:
        displayRatingA,
      opponentInternalRating:
        ratingForTitleA,
      opponentTitle:
        titleA,
      selfUserId:
        userB?.id ?? null,
      selfDisplayName:
        displayNameB,
      selfDisplayRating:
        displayRatingB,
      selfInternalRating:
        ratingForTitleB,
      selfTitle:
        titleB,
      selfTeam:
        teamB,
      opponentUserId:
        userA?.id ?? null,
      opponentTeam:
        teamA,
    }
  );
}

// ======================================================
// Socket.IO
// ======================================================

io.on("connection", (socket) => {
  onlineCount += 1;

  log(
    "socket connected:",
    socket.id,
    "onlineCount:",
    onlineCount
  );

  // ====================================================
  // レート�EチE��
  // ====================================================

  socket.on(
    "rate:join-queue",
    async ({
      name,
      rating,
      userId,
    }) => {
      const safeName =
        name || "プレイヤー";

      const safeRating =
        typeof rating === "number"
          ? rating
          : 1500;

      const safeUserId =
        typeof userId === "number" ||
        typeof userId === "string"
          ? userId
          : null;

      const idx =
        rateQueue.findIndex(
          (p) =>
            p.socketId ===
            socket.id
        );

      if (idx !== -1) {
        rateQueue.splice(
          idx,
          1
        );
      }

      rateQueue.push({
        socketId:
          socket.id,
        name: safeName,
        rating:
          safeRating,
        userId:
          safeUserId,
        joinedAt:
          Date.now(),
      });

      socket.emit(
        "rate:queue-updated",
        {
          size:
            rateQueue.length,
        }
      );

      await tryRateMatch();
    }
  );

  socket.on(
    "rate:leave-queue",
    () => {
      const idx =
        rateQueue.findIndex(
          (p) =>
            p.socketId ===
            socket.id
        );

      if (idx !== -1) {
        rateQueue.splice(
          idx,
          1
        );
      }

      socket.emit(
        "rate:queue-updated",
        {
          size:
            rateQueue.length,
        }
      );
    }
  );

  // ====================================================
  // ☁EフリーマッチE
  // ====================================================

  // --------------------------------
  // 部屋を作る
  // --------------------------------

  socket.on(
    "free:create",
    ({ name, userId }) => {
      // 既存�EフリーマッチE��屋から抜ける
      removeSocketFromFreeRooms(
        socket.id
      );

      const roomId =
        generateFreeRoomId();

      if (!roomId) {
        socket.emit(
          "free:error",
          {
            message:
              "部屋を作�Eできませんでした。もぁE��度お試しください、E,
          }
        );

        return;
      }

      const playerName =
        name || "プレイヤー";

const room = {
  roomId,
  hostSocketId:
    socket.id,
  hostUserId:
    userId ?? null,
  players:
    new Map(),
  selectedGame:
    null,
  createdAt:
    Date.now(),
};

 room.players.set(
  socket.id,
  {
    socketId:
      socket.id,
    userId:
      userId ?? null,
    name:
      playerName,
    isHost: true,
  }
);

      freeRooms.set(
        roomId,
        room
      );

      socket.join(
        `free:${roomId}`
      );

      log(
        "free room created:",
        roomId,
        playerName
      );

      socket.emit(
        "free:created",
        makeFreeRoomPayload(
          room
        )
      );

      broadcastFreeRoom(
        room
      );
    }
  );

  // --------------------------------
  // 部屋を探ぁE
  // --------------------------------

  socket.on(
    "free:join",
    ({ roomId, name, userId }) => {
      const safeRoomId =
        String(
          roomId ?? ""
        ).replace(
          /\D/g,
          ""
        );

      if (
        safeRoomId.length !== 4
      ) {
        socket.emit(
          "free:error",
          {
            message:
              "部屋IDは4桁�E数字で入力してください、E,
          }
        );

        return;
      }

      const room =
        freeRooms.get(
          safeRoomId
        );

      if (!room) {
        socket.emit(
          "free:error",
          {
            message:
              "そ�E部屋�E見つかりませんでした、E,
          }
        );

        return;
      }

      if (
        room.players.size >=
        FREE_ROOM_MAX_PLAYERS
      ) {
        socket.emit(
          "free:error",
          {
            message:
              "こ�E部屋�E満員です、E,
          }
        );

        return;
      }

      // すでに同じ部屋にぁE��場吁E
      if (
        room.players.has(
          socket.id
        )
      ) {
        socket.emit(
          "free:room-state",
          makeFreeRoomPayload(
            room
          )
        );

        return;
      }

      // 他�E部屋にぁE��場合�E抜けめE
      removeSocketFromFreeRooms(
        socket.id
      );

      const playerName =
        name || "プレイヤー";

room.players.set(
  socket.id,
  {
    socketId:
      socket.id,
    userId:
      userId ?? null,
    name:
      playerName,
    isHost: false,
  }
);

      socket.join(
        `free:${safeRoomId}`
      );

      log(
        "free room joined:",
        safeRoomId,
        playerName,
        `${room.players.size}/${FREE_ROOM_MAX_PLAYERS}`
      );

      broadcastFreeRoom(
        room
      );
    }
  );

  // --------------------------------
  // 部屋から抜ける
  // --------------------------------

  socket.on(
    "free:leave",
    () => {
      removeSocketFromFreeRooms(
        socket.id
      );
    }
  );

  // --------------------------------
  // ゲーム選抁E
  // --------------------------------

  socket.on(
    "free:select-game",
    ({ roomId, gameId }) => {
      const safeRoomId =
        String(
          roomId ?? ""
        );

      const room =
        freeRooms.get(
          safeRoomId
        );

      if (!room) {
        socket.emit(
          "free:error",
          {
            message:
              "部屋が見つかりません、E,
          }
        );

        return;
      }

      // 部屋主だけゲームを選べめE
      if (
        room.hostSocketId !==
        socket.id
      ) {
        socket.emit(
          "free:error",
          {
            message:
              "ゲームを選択できるのは部屋主です、E,
          }
        );

        return;
      }

      room.selectedGame =
        gameId || null;

      log(
        "free game selected:",
        safeRoomId,
        room.selectedGame
      );

      broadcastFreeRoom(
        room
      );
    }
  );

  // --------------------------------
  // ゲーム開姁E
  //
  // 今�Eゲーム本体未実裁E��ので
  // 選択状態だけ保持する、E
  // 後で吁E��ームの開始�E琁E��追加、E
  // --------------------------------

    socket.on(
    "free:start-game",
    ({ roomId }) => {
      const safeRoomId = String(roomId ?? "");

console.log("[saikoro-start] request", {
  roomId: safeRoomId,
  socketId: socket.id,
});
      const room = freeRooms.get(safeRoomId);

      if (!room) {
        socket.emit("free:error", {
          message: "部屋が見つかりません、E,
        });
        return;
      }

      const isSaikoroHost =
        room.selectedGame === "saikoro" &&
        Array.from(room.players.values()).some(
          (player) =>
            player.socketId === socket.id &&
            player.isHost === true
        );

      if (
        room.hostSocketId !== socket.id &&
        !isSaikoroHost
      ) {
        socket.emit("free:error", {
          message: "ゲームを開始できるのは部屋主です、E,
        });
        return;
      }

      if (!room.selectedGame) {
        socket.emit("free:error", {
          message: "ゲームを選択してください、E,
        });
        return;
      }

      const roomPlayers =
        room.players instanceof Map
          ? Array.from(room.players.values())
          : Array.isArray(room.players)
            ? room.players
            : [];

      if (room.selectedGame === "saikoro") {


    console.log("[saikoro-start] check", {
      selectedGame: room.selectedGame,
      playerCount: roomPlayers.length,
      hostSocketId: room.hostSocketId,
      players: roomPlayers.map((player) => ({
        socketId: player.socketId,
        isHost: player.isHost,
        name: player.name,
      })),
      startRequested: room.saikoroStartRequested,
      gameExists: saikoroGames.has(safeRoomId),
      gamePhase: saikoroGames.get(safeRoomId)?.phase,
    });

    if (roomPlayers.length !== 4) {
      socket.emit("free:error", {
        message: `看板たぬき�E4人専用です。現在 ${roomPlayers.length}/4人です。`,
      });
      return;
    }

    if (room.saikoroStartRequested) {
      socket.emit("free:error", {
        message: "ゲームはすでに開始�E琁E��です、E,
      });
      return;
    }

    room.saikoroStartRequested = true;

    let saikoroGame = saikoroGames.get(safeRoomId);

    if (!saikoroGame) {
      saikoroGame = {
        roomId: safeRoomId,
        phase: "waiting",
        round: 0,
        turnPlayer: 0,
        players: {},
        diceResults: {},
        actionUsed: {},
        extraActionUsed: {},
        answerTarget: null,
        message: "全員でダイスを振ってください、E,
      };

      saikoroGames.set(safeRoomId, saikoroGame);
    }

    if (saikoroGame.phase !== "waiting") {
      room.saikoroStartRequested = false;

      socket.emit("free:error", {
        message: "看板たぬき�Eすでに開始されてぁE��す、E,
      });

      return;
    }

    const started = saikoroStartGame(saikoroGame);

    if (!started) {
      room.saikoroStartRequested = false;
      return;
    }



  // ====================================================
  // 通常バトル
  // ====================================================

  socket.on(
    "battle:join",
    ({
      roomId,
      playerName,
      userId,
    }) => {
      if (!roomId) return;

      let room =
        rooms.get(roomId);

      if (!room) {
        room = {
          players:
            new Map(),
          answers:
            new Map(),
          maxQuestions:
            30,
          isFinished:
            false,
          createdAt:
            Date.now(),
        };

        rooms.set(
          roomId,
          room
        );

        log(
          "room created:",
          roomId
        );
      }

      const name =
        playerName ||
        "プレイヤー";

      room.players.set(
        socket.id,
        {
          socketId:
            socket.id,
          name,
          score: 0,
          totalTimeMs: 0,
          userId:
            userId ?? null,
        }
      );

      socket.join(
        roomId
      );

      const playersArr =
        Array.from(
          room.players.values()
        );

      if (
        playersArr.length ===
          2 &&
        !room.isFinished
      ) {
        const [
          p0,
          p1,
        ] = playersArr;

        io.to(
          p0.socketId
        ).emit(
          "battle:start",
          {
            roomId,
            opponentName:
              p1.name,
            currentQuestionIndex:
              0,
          }
        );

        io.to(
          p1.socketId
        ).emit(
          "battle:start",
          {
            roomId,
            opponentName:
              p0.name,
            currentQuestionIndex:
              0,
          }
        );
      }
    }
  );

  socket.on(
    "battle:answer",
    async ({
      roomId,
      questionIndex,
      isCorrect,
      timeMs,
    }) => {
      const room =
        rooms.get(roomId);

      if (
        !room ||
        room.isFinished
      ) {
        return;
      }

      const player =
        room.players.get(
          socket.id
        );

      if (!player) return;

      const idx =
        typeof questionIndex ===
        "number"
          ? questionIndex
          : 0;

      const used =
        typeof timeMs ===
        "number"
          ? timeMs
          : 0;

      if (isCorrect) {
        player.score += 1;
      }

      player.totalTimeMs +=
        used;

      let ansMap =
        room.answers.get(
          idx
        );

      if (!ansMap) {
        ansMap = new Map();

        room.answers.set(
          idx,
          ansMap
        );
      }

      ansMap.set(
        socket.id,
        {
          isCorrect:
            !!isCorrect,
          timeMs:
            used,
        }
      );

      const playersArr =
        Array.from(
          room.players.values()
        );

      if (
        ansMap.size <
        playersArr.length
      ) {
        return;
      }

      const nextIndex =
        idx + 1;

      const maxQuestions =
        room.maxQuestions;

      const [
        p0,
        p1,
      ] = playersArr;

      let finished = false;

      if (
        p0.score >= 10 ||
        p1.score >= 10
      ) {
        finished = true;
      }

      if (
        nextIndex >=
        maxQuestions
      ) {
        finished = true;
      }

      if (finished) {
        room.isFinished =
          true;

        try {
          await updateRatingsNormalFinish(
            p0,
            p1
          );
        } catch (e) {
          log(
            "updateRatingsNormalFinish error:",
            e
          );
        }

        const makePayloadFor =
          (
            self,
            opp
          ) => {
            let outcome =
              "draw";

            if (
              self.score >
              opp.score
            ) {
              outcome =
                "win";
            } else if (
              self.score <
              opp.score
            ) {
              outcome =
                "lose";
            } else if (
              self.totalTimeMs <
              opp.totalTimeMs
            ) {
              outcome =
                "win";
            } else if (
              self.totalTimeMs >
              opp.totalTimeMs
            ) {
              outcome =
                "lose";
            }

            return {
              outcome,
              self: {
                score:
                  self.score,
                totalTimeMs:
                  self.totalTimeMs,
              },
              opponent: {
                score:
                  opp.score,
                totalTimeMs:
                  opp.totalTimeMs,
              },
            };
          };

        io.to(
          p0.socketId
        ).emit(
          "battle:finished",
          makePayloadFor(
            p0,
            p1
          )
        );

        io.to(
          p1.socketId
        ).emit(
          "battle:finished",
          makePayloadFor(
            p1,
            p0
          )
        );

        rooms.delete(
          roomId
        );
      } else {
        const scoresPayload =
          playersArr.map(
            (p) => ({
              socketId:
                p.socketId,
              name:
                p.name,
              score:
                p.score,
              totalTimeMs:
                p.totalTimeMs,
            })
          );

        setTimeout(() => {
          const currentRoom =
            rooms.get(
              roomId
            );

          if (
            !currentRoom ||
            currentRoom.isFinished
          ) {
            return;
          }

          const currentPlayers =
            Array.from(
              currentRoom.players.values()
            );

          currentPlayers.forEach(
            (p) => {
              io.to(
                p.socketId
              ).emit(
                "battle:next",
                {
                  roomId,
                  nextQuestionIndex:
                    nextIndex,
                  scores:
                    scoresPayload,
                }
              );
            }
          );
        }, 2000);
      }
    }
  );

  // ====================================================
  // 刁E��
  // ====================================================

  socket.on(
    "disconnect",
    async () => {
      onlineCount =
        Math.max(
          0,
          onlineCount - 1
        );

      log(
        "socket disconnected:",
        socket.id,
        "onlineCount:",
        onlineCount
      );

      // レートキューから削除
      const rateIndex =
        rateQueue.findIndex(
          (p) =>
            p.socketId ===
            socket.id
        );

      if (
        rateIndex !== -1
      ) {
        rateQueue.splice(
          rateIndex,
          1
        );
      }

      // ☁EフリーマッチE��屋から削除
      removeSocketFromFreeRooms(
        socket.id
      );

      // 通常バトルから削除
      for (
        const [
          roomId,
          room,
        ] of rooms
      ) {
        if (
          room.players.has(
            socket.id
          )
        ) {
          const leaver =
            room.players.get(
              socket.id
            );

          room.players.delete(
            socket.id
          );

          const remaining =
            Array.from(
              room.players.values()
            );

          if (
            !room.isFinished &&
            remaining.length === 1
          ) {
            const winner =
              remaining[0];

            room.isFinished =
              true;

            try {
              await updateRatingsDisconnectFinish(
                winner,
                leaver
              );
            } catch (e) {
              log(
                "updateRatingsDisconnectFinish error:",
                e
              );
            }

            io.to(
              winner.socketId
            ).emit(
              "battle:finished",
              {
                outcome:
                  "win",
                self: {
                  score:
                    winner.score,
                  totalTimeMs:
                    winner.totalTimeMs,
                },
                opponent: {
                  score:
                    leaver.score ??
                    0,
                  totalTimeMs:
                    leaver.totalTimeMs ??
                    0,
                },
              }
            );

            rooms.delete(
              roomId
            );
          } else if (
            room.players.size ===
            0
          ) {
            rooms.delete(
              roomId
            );
          }
        }
      }
    }
  );

// ======================================================
// 起勁E
// ======================================================

httpServer.listen(
  PORT,
  () => {
    log(
      `Socket.IO server listening on port ${PORT}`
    );
  }
);

// ============================================================
// ミス・フライチE�EのえじぁE
// ============================================================
//
// 既存�E rate / free 処琁E��は手を入れなぁE��E
// こ�EブロチE��めEserver.js の一番下に追加するだけ、E
// ============================================================

const hawkGames = new Map();

const HAWK_SCORE_CARDS = [
  -5,
  -4,
  -3,
  -2,
  -1,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
];

const HAWK_TOTAL_ROUNDS = 15;


// ============================================================
// popularity.xlsx を読み込む
// ============================================================

async function loadHawkPopularityData() {
  try {
    const XLSX = await import('xlsx');

    const workbook =
      XLSX.default?.readFile
        ? XLSX.default
        : XLSX;

    const fs =
      await import('node:fs');

    const path =
      await import('node:path');

    const absolutePath =
      path.join(
        process.cwd(),
        'data',
        'popularity.xlsx'
      );

    if (
      !fs.existsSync(
        absolutePath
      )
    ) {
      throw new Error(
        `popularity.xlsx が見つかりません: ${absolutePath}`
      );
    }

    const wb =
      workbook.readFile(
        absolutePath
      );

    const sheetName =
      wb.SheetNames?.[0];

    if (!sheetName) {
      throw new Error(
        'popularity.xlsx にシートがありません、E
      );
    }

    const sheet =
      wb.Sheets[
        sheetName
      ];

    const rows =
      XLSX.utils.sheet_to_json(
        sheet,
        {
          header: 1,
          defval: '',
        }
      );

    const characters = [];

    for (
      let i = 0;
      i < rows.length;
      i += 1
    ) {
      const row =
        rows[i];

      if (
        !Array.isArray(row) ||
        row.length < 2
      ) {
        continue;
      }

      const rawRank =
        row[0];

      const rawName =
        row[1];

      const rank =
        Number(
          String(
            rawRank
          )
            .replace(
              /,/g,
              ''
            )
            .trim()
        );

      const name =
        String(
          rawName ?? ''
        ).trim();

      if (
        !Number.isFinite(rank) ||
        rank <= 0 ||
        !name
      ) {
        continue;
      }

      characters.push({
        rank,
        name,
        sourceIndex: i,
      });
    }

    if (
      characters.length < 15
    ) {
      throw new Error(
        `popularity.xlsx から15人以上�Eキャラクターを読み込めませんでした。読み込み数: ${characters.length}`
      );
    }

    return characters;
  } catch (error) {
    console.error(
      '[hawk] popularity.xlsx 読み込みエラー:',
      error
    );

    throw error;
  }
}


// ============================================================
// ExcelチE�EタのキャチE��ュ
// ============================================================

let hawkPopularityCache =
  null;

async function getHawkPopularityData() {
  if (
    Array.isArray(
      hawkPopularityCache
    ) &&
    hawkPopularityCache.length > 0
  ) {
    return hawkPopularityCache;
  }

  hawkPopularityCache =
    await loadHawkPopularityData();

  return hawkPopularityCache;
}


// ============================================================
// Fisher-YatesシャチE��ル
// ============================================================

function hawkShuffle(
  array
) {
  const result =
    [...array];

  for (
    let i =
      result.length - 1;
    i > 0;
    i -= 1
  ) {
    const j =
      Math.floor(
        Math.random() *
          (i + 1)
      );

    [
      result[i],
      result[j],
    ] = [
      result[j],
      result[i],
    ];
  }

  return result;
}


// ============================================================
// 人気頁E��かめE5キャラを選ぶ
// ============================================================
//
// スタート頁E���E完�Eランダム、E
// 例えば間隔10なめE
//
// 45 ↁE55 ↁE65 ↁE... ↁE185
//
// のように15人を選ぶ、E
// 実際の頁E��に存在しなぁE��合�E一番近い頁E��を使用、E
// 同距離ならランダム、E
// 最後にカード表示頁E��シャチE��ル、E
// ============================================================

function hawkSelectCharacters(
  popularityData,
  interval
) {
  if (
    !Array.isArray(popularityData) ||
    popularityData.length === 0
  ) {
    return [];
  }

  const sorted =
    popularityData
      .filter(
        (item) =>
          Number.isFinite(
            Number(item.rank)
          ) &&
          item.name
      )
      .map(
        (item) => ({
          ...item,
          rank:
            Number(
              item.rank
            ),
        })
      )
      .sort(
        (a, b) =>
          a.rank -
          b.rank
      );

  if (
    sorted.length === 0
  ) {
    return [];
  }

  const step =
    Math.max(
      1,
      Number(interval) || 1
    );

  const maxRank =
    sorted[
      sorted.length - 1
    ].rank;

  const maxStart =
    Math.max(
      1,
      maxRank -
        step * 14
    );

  const startRank =
    1 +
    Math.floor(
      Math.random() *
        maxStart
    );

  const selected = [];

  const usedNames =
    new Set();

  for (
    let i = 0;
    i < 15;
    i += 1
  ) {
    const targetRank =
      startRank +
      step * i;

    const available =
      sorted.filter(
        (item) =>
          !usedNames.has(
            item.name
          )
      );

    if (
      available.length === 0
    ) {
      break;
    }

    let minDistance =
      Infinity;

    for (
      const item of available
    ) {
      const distance =
        Math.abs(
          item.rank -
            targetRank
        );

      if (
        distance <
        minDistance
      ) {
        minDistance =
          distance;
      }
    }

    const candidates =
      available.filter(
        (item) =>
          Math.abs(
            item.rank -
              targetRank
          ) ===
          minDistance
      );

    const selectedItem =
      candidates[
        Math.floor(
          Math.random() *
            candidates.length
        )
      ];

    selected.push({
      ...selectedItem,
      targetRank,
    });

    usedNames.add(
      selectedItem.name
    );
  }

  return hawkShuffle(
    selected
  );
}


// ============================================================
// クライアントに送ってよいカード情報
// ============================================================

function hawkPublicCard(
  card
) {
  if (!card) {
    return null;
  }

  return {
    id:
      card.id,
    name:
      card.name,
  };
}


// ============================================================
// 現在のプレイヤー一覧
// ============================================================

function hawkGetPlayers(
  game
) {
  const room =
    freeRooms.get(
      game.roomId
    );

  if (!room) {
    return [];
  }

  if (
    room.players instanceof Map
  ) {
    return Array.from(
      room.players.values()
    );
  }

  if (
    Array.isArray(
      room.players
    )
  ) {
    return room.players;
  }

  return [];
}


// ============================================================
// 現在の得点
// ============================================================

function hawkGetScores(
  game
) {
  const players =
    hawkGetPlayers(
      game
    );

  return players.map(
    (player) => ({
      socketId:
        player.socketId,

      name:
        player.name ||
        'プレイヤー',

      score:
        Number(
          game.scores[
            player.socketId
          ] ?? 0
        ),
    })
  );
}


// ============================================================
// 部屋状態を吁E�Eレイヤーへ送信
// ============================================================

function hawkBroadcastRoomState(
  game
) {
  const room =
    freeRooms.get(
      game.roomId
    );

  if (!room) {
    return;
  }

  const players =
    hawkGetPlayers(
      game
    );

  const payload = {
    room: {
      roomId:
        room.roomId,

      players:
        players.map(
          (player) => ({
            socketId:
              player.socketId,

            userId:
              player.userId ??
              null,

            name:
              player.name ||
              'プレイヤー',

            isHost:
              player.socketId ===
              room.hostSocketId,

            playerNumber:
              player.playerNumber,
          })
        ),

      maxPlayers:
        FREE_ROOM_MAX_PLAYERS,

      hostSocketId:
        room.hostSocketId,

      hostUserId:
        room.hostUserId ??
        null,
    },

    phase:
      game.phase,

    scores:
      hawkGetScores(
        game
      ),
  };

  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      targetSocket
    ) {
      targetSocket.emit(
        'hawk:room-state',
        payload
      );
    }
  }
}


// ============================================================
// 自刁E�E手札を送る
// ============================================================

function hawkSendMyCards(
  game,
  socket
) {
  if (!socket) {
    return;
  }

  const hand =
    game.hands[
      socket.id
    ];

  if (
    !Array.isArray(hand)
  ) {
    return;
  }

  const publicCards =
    hand
      .map(
        (cardId) =>
          hawkPublicCard(
            game.cardMap[
              cardId
            ]
          )
      )
      .filter(Boolean);

  socket.emit(
    'hawk:my-cards',
    {
      cards:
        publicCards,
    }
  );
}


// ============================================================
// 全員へ自刁E�E手札を送る
// ============================================================

function hawkSendAllHands(
  game
) {
  const players =
    hawkGetPlayers(
      game
    );

  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      targetSocket
    ) {
      hawkSendMyCards(
        game,
        targetSocket
      );
    }
  }
}


// ============================================================
// ラウンド開姁E
// ============================================================

function hawkEmitRoundStarted(
  game
) {
  const players =
    hawkGetPlayers(
      game
    );

  const nextScore =
    game.scoreDeck.shift();

  if (
    nextScore !== undefined
  ) {
    game.currentScore =
      nextScore;

    game.carryCards = [
      ...game.carryCards,
      nextScore,
    ];
  }

  const scoreTotal =
    game.carryCards.reduce(
      (
        sum,
        value
      ) =>
        sum + value,
      0
    );

  game.currentScoreTotal =
    scoreTotal;

  game.played =
    {};

  game.phase =
    'playing';

  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      !targetSocket
    ) {
      continue;
    }

    targetSocket.emit(
      'hawk:round-started',
      {
        round:
          game.round,

        scoreCard:
          scoreTotal,

        scoreCards:
          [
            ...game.carryCards,
          ],

        scores:
          hawkGetScores(
            game
          ),
      }
    );

    hawkSendMyCards(
      game,
      targetSocket
    );
  }

  console.log(
    `[hawk] round ${game.round} start room=${game.roomId} score=${scoreTotal} cards=${game.carryCards.join(',')}`
  );
}


// ============================================================
// ゲーム開姁E
// ============================================================

async function hawkStartGame(
  game,
  interval
) {
  const popularityData =
    await getHawkPopularityData();

  const selectedRaw =
    hawkSelectCharacters(
      popularityData,
      interval
    );

  /*
   * 吁E��ードにゲーム冁E��用IDを付ける、E
   */
  const selected =
    selectedRaw.map(
      (card, index) => ({
        ...card,
        id:
          `hawk-card-${index}`,
      })
    );

  if (
    selected.length !==
    15
  ) {
    throw new Error(
      `キャラクターカードを15枚作�Eできませんでした。作�E数: ${selected.length}`
    );
  }

  game.interval =
    interval;

  game.characters =
    selected;

  game.cardMap =
    {};

  for (
    const card of selected
  ) {
    game.cardMap[
      card.id
    ] = card;
  }

  /*
   * 全員同じ15枚を持つ、E
   */
  game.hands =
    {};

  const players =
    hawkGetPlayers(
      game
    );

  for (
    const player of players
  ) {
    game.hands[
      player.socketId
    ] =
      selected.map(
        (card) =>
          card.id
      );
  }

  /*
   * 得点カードをシャチE��ル、E
   */
  game.scoreDeck =
    hawkShuffle(
      HAWK_SCORE_CARDS
    );

  game.carryCards =
    [];

  game.currentScore =
    null;

  game.currentScoreTotal =
    null;

  game.round =
    1;

  game.played =
    {};

  game.scores =
    {};

  game.cardHistory =
    [];

  for (
    const player of players
  ) {
    game.scores[
      player.socketId
    ] = 0;
  }

  game.phase =
    'playing';

  /*
   * ゲーム中は名前だけ、E
   * rankは絶対に送らなぁE��E
   */
  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      !targetSocket
    ) {
      continue;
    }

    targetSocket.emit(
      'hawk:game-started',
      {
        round:
          game.round,

        scoreCard:
          null,

        myCards:
          selected.map(
            hawkPublicCard
          ),

        scores:
          hawkGetScores(
            game
          ),
      }
    );
  }

  /*
   * 1枚目の得点カードを開始、E
   */
  hawkEmitRoundStarted(
    game
  );

  hawkBroadcastRoomState(
    game
  );

  console.log(
    `[hawk] game started room=${game.roomId} interval=${interval} characters=${selected.length}`
  );
}


// ============================================================
// ラウンド判宁E
// ============================================================

function hawkResolveRound(
  game
) {
  const players =
    hawkGetPlayers(
      game
    );

  const playedCards =
    players
      .map(
        (player) => {
          const cardId =
            game.played[
              player.socketId
            ];

          const card =
            game.cardMap[
              cardId
            ];

          if (!card) {
            return null;
          }

          return {
            socketId:
              player.socketId,

            playerName:
              player.name ||
              'プレイヤー',

            cardId:
              card.id,

            name:
              card.name,

            rank:
              card.rank,
          };
        }
      )
      .filter(Boolean);

  const publicPlayedCards =
    playedCards.map(
      (card) => ({
        socketId:
          card.socketId,

        playerName:
          card.playerName,

        cardId:
          card.cardId,

        name:
          card.name,
      })
    );

  const score =
    game.carryCards.reduce(
      (
        sum,
        value
      ) =>
        sum + value,
      0
    );

  /*
   * 同じ人気頁E��を出した人は全員無効、E
   */
  const rankCount =
    new Map();

  for (
    const card of playedCards
  ) {
    const count =
      rankCount.get(
        card.rank
      ) || 0;

    rankCount.set(
      card.rank,
      count + 1
    );
  }

  const eligible =
    playedCards.filter(
      (card) =>
        rankCount.get(
          card.rank
        ) === 1
    );

  let winner =
    null;

  if (
    eligible.length > 0
  ) {
    /*
     * プラス・0�E�E
     * 人気頁E���E数字が小さぁE��が強ぁE��E
     *
     * マイナス�E�E
     * 人気頁E���E数字が大きい方が強ぁE��E
     */
    if (
      score >= 0
    ) {
      winner =
        [...eligible].sort(
          (a, b) =>
            a.rank -
            b.rank
        )[0];
    } else {
      winner =
        [...eligible].sort(
          (a, b) =>
            b.rank -
            a.rank
        )[0];
    }
  }

  /*
   * 全員バッチE��ング、E
   */
  if (!winner) {
    const lastRound =
      game.round >=
      HAWK_TOTAL_ROUNDS;

    const playersNow =
      hawkGetPlayers(
        game
      );

    for (
      const player of playersNow
    ) {
      const targetSocket =
        io.sockets.sockets.get(
          player.socketId
        );

      if (
        targetSocket
      ) {
        targetSocket.emit(
          'hawk:cards-revealed',
          {
            playedCards:
              publicPlayedCards,
          }
        );
      }
    }

    if (
      lastRound
    ) {
      return {
        winner:
          null,

        score,

        winnerName:
          null,

        tieInfo:
          '全員のカードが無効になったため、この得点カード�E誰も獲得しません、E,

        playedCards:
          publicPlayedCards,

        finished:
          true,
      };
    }

    return {
      winner:
        null,

      score,

      winnerName:
        null,

      tieInfo:
        '全員のカードが無効になりました。得点カード�E次のラウンドへ持ち越されます、E,

      playedCards:
        publicPlayedCards,

      finished:
        false,
    };
  }

  /*
   * 勝老E��得点カードを獲得、E
   */
  game.scores[
    winner.socketId
  ] =
    Number(
      game.scores[
        winner.socketId
      ] ?? 0
    ) + score;

  /*
   * キャリーオーバ�Eを空にする、E
   */
  game.carryCards =
    [];

  const playersNow =
    hawkGetPlayers(
      game
    );

  for (
    const player of playersNow
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      targetSocket
    ) {
      targetSocket.emit(
        'hawk:cards-revealed',
        {
          playedCards:
            publicPlayedCards,
        }
      );
    }
  }

  return {
    winner:
      winner.socketId,

    score,

    winnerName:
      winner.playerName,

    tieInfo:
      null,

    playedCards:
      publicPlayedCards,

    finished:
      false,
  };
}


// ============================================================
// 最終結果を作�E
// ============================================================

function hawkBuildFinalResults(
  game
) {
  return game.characters.map(
    (card) => {
      const history =
        [];

      for (
        const item of
          game.cardHistory ||
          []
      ) {
        const played =
          item.playedCards?.find(
            (playedCard) =>
              playedCard.cardId ===
              card.id
          );

        if (
          played
        ) {
          history.push(
            `第${item.round}回戦�E�E{played.playerName}`
          );
        }
      }

      return {
        cardId:
          card.id,

        name:
          card.name,

        rank:
          card.rank,

        targetRank:
          card.targetRank,

        history:
          history.join(
            ' / '
          ),
      };
    }
  );
}


// ============================================================
// ゲーム終亁E
// ============================================================

function hawkFinishGame(
  game
) {
  game.phase =
    'finished';

  const players =
    hawkGetPlayers(
      game
    );

  const scores =
    hawkGetScores(
      game
    );

  const results =
    hawkBuildFinalResults(
      game
    );

  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      !targetSocket
    ) {
      continue;
    }

    targetSocket.emit(
      'hawk:game-finished',
      {
        scores,
        results,
      }
    );
  }

  hawkBroadcastRoomState(
    game
  );

  console.log(
    `[hawk] game finished room=${game.roomId}`
  );
}


// ============================================================
// Hawk専用Socket.IO
// ============================================================

io.on(
  'connection',
  (socket) => {

    // ========================================================
    // Hawk 部屋へ参加
    // ========================================================

    socket.on(
      'hawk:join',
      (payload) => {
        const safeRoomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        if (
          safeRoomId.length !==
          4
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                '部屋IDが正しくありません、E,
            }
          );

          return;
        }

        const room =
          freeRooms.get(
            safeRoomId
          );

        if (!room) {
          socket.emit(
            'hawk:error',
            {
              message:
                'フリーマッチE��屋が見つかりません、E,
            }
          );

          return;
        }

        const incomingUserId =
          payload?.userId != null
            ? String(
                payload.userId
              )
            : '';

        const incomingName =
          String(
            payload?.name ||
              ''
          ).trim();

        const freePlayers =
          room.players instanceof Map
            ? Array.from(
                room.players.values()
              )
            : Array.isArray(
                room.players
              )
              ? room.players
              : [];

        let playerIndex =
          freePlayers.findIndex(
            (item) =>
              item.socketId ===
              socket.id
          );

        /*
         * userIdで探す、E
         */
        if (
          playerIndex < 0 &&
          incomingUserId
        ) {
          playerIndex =
            freePlayers.findIndex(
              (item) =>
                item.userId != null &&
                String(
                  item.userId
                ) ===
                  incomingUserId
            );
        }

        /*
         * 名前で探す、E
         */
        if (
          playerIndex < 0 &&
          incomingName
        ) {
          const sameNamePlayers =
            freePlayers.filter(
              (item) =>
                String(
                  item.name ||
                    ''
                ).trim() ===
                incomingName
            );

          if (
            sameNamePlayers.length ===
            1
          ) {
            playerIndex =
              freePlayers.findIndex(
                (item) =>
                  String(
                    item.name ||
                      ''
                  ).trim() ===
                  incomingName
              );
          }
        }

        if (
          playerIndex < 0
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'こ�E部屋�E参加老E��はありません、E,
            }
          );

          return;
        }

        const player =
          freePlayers[
            playerIndex
          ];

        const oldSocketId =
          player.socketId;

        /*
         * ホスト判定、E
         */
        const hostUserId =
          room.hostUserId != null
            ? String(
                room.hostUserId
              )
            : String(
                room.hostSocketId ||
                  ''
              );

        const wasHost =
          (
            player.userId != null &&
            String(
              player.userId
            ) ===
              hostUserId
          ) ||
          oldSocketId ===
            room.hostSocketId;

        /*
         * 古いSocketを部屋から離す、E
         */
        if (
          oldSocketId &&
          oldSocketId !==
            socket.id
        ) {
          const oldSocket =
            io.sockets.sockets.get(
              oldSocketId
            );

          if (oldSocket) {
            oldSocket.leave(
              `free:${safeRoomId}`
            );
          }
        }

        /*
         * Socket IDを更新、E
         */
        player.socketId =
          socket.id;

        if (
          wasHost
        ) {
          room.hostSocketId =
            socket.id;
        }

        /*
         * 全員のホスト状態を更新、E
         */
        if (
          room.players instanceof Map
        ) {
          for (
            const item of
              room.players.values()
          ) {
            item.isHost =
              item.socketId ===
              room.hostSocketId;
          }
        } else if (
          Array.isArray(
            room.players
          )
        ) {
          for (
            const item of
              room.players
          ) {
            item.isHost =
              item.socketId ===
              room.hostSocketId;
          }
        }

        console.log(
          `[hawk] player transfer room=${safeRoomId} name=${player.name} oldSocket=${oldSocketId} newSocket=${socket.id} isHost=${room.hostSocketId === socket.id}`
        );

        let game =
          hawkGames.get(
            safeRoomId
          );

        if (!game) {
          game = {
            roomId:
              safeRoomId,

            phase:
              'setup',

            interval:
              null,

            characters:
              [],

            cardMap:
              {},

            hands:
              {},

            scoreDeck:
              [],

            carryCards:
              [],

            currentScore:
              null,

            currentScoreTotal:
              null,

            round:
              0,

            played:
              {},

            scores:
              {},

            cardHistory:
              [],
          };

          hawkGames.set(
            safeRoomId,
            game
          );
        }

        /*
         * ゲーム開始後�E再接続なめE
         * 古いSocketのチE�Eタを新しいSocketへ移す、E
         */
        if (
          oldSocketId &&
          oldSocketId !==
            socket.id
        ) {
          if (
            game.hands[
              oldSocketId
            ]
          ) {
            game.hands[
              socket.id
            ] =
              game.hands[
                oldSocketId
              ];

            delete game.hands[
              oldSocketId
            ];
          }

          if (
            game.played[
              oldSocketId
            ]
          ) {
            game.played[
              socket.id
            ] =
              game.played[
                oldSocketId
              ];

            delete game.played[
              oldSocketId
            ];
          }

          if (
            game.scores[
              oldSocketId
            ] !== undefined
          ) {
            game.scores[
              socket.id
            ] =
              game.scores[
                oldSocketId
              ];

            delete game.scores[
              oldSocketId
            ];
          }
        }

        /*
         * ゲーム開始後に新しく入ってきた場合�E
         * 現在のゲームへ参加させなぁE��E
         *
         * 再接続で手札が移されてぁE��ば許可、E
         */
        if (
          game.phase !==
            'setup' &&
          !game.hands[
            socket.id
          ]
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'こ�Eゲームはすでに開始されてぁE��す、E,
            }
          );

          return;
        }

        /*
         * スコア初期化、E
         */
        if (
          game.scores[
            socket.id
          ] === undefined
        ) {
          game.scores[
            socket.id
          ] = 0;
        }

        socket.join(
          `hawk:${safeRoomId}`
        );

        console.log(
          `[hawk] join room=${safeRoomId} socket=${socket.id}`
        );

        hawkBroadcastRoomState(
          game
        );

        socket.emit(
          'hawk:connected'
        );

        /*
         * ゲーム中なら�E刁E�E手札を復允E��E
         */
        if (
          game.phase ===
            'playing' ||
          game.phase ===
            'result'
        ) {
          hawkSendMyCards(
            game,
            socket
          );

          socket.emit(
            'hawk:round-started',
            {
              round:
                game.round,

              scoreCard:
                game.currentScoreTotal,

              scoreCards:
                [
                  ...game.carryCards,
                ],

              scores:
                hawkGetScores(
                  game
                ),
            }
          );
        }

        /*
         * ゲーム終亁E��なら最終結果も送る、E
         */
        if (
          game.phase ===
          'finished'
        ) {
          socket.emit(
            'hawk:game-finished',
            {
              scores:
                hawkGetScores(
                  game
                ),

              results:
                hawkBuildFinalResults(
                  game
                ),
            }
          );
        }
      }
    );


    // ========================================================
    // ゲーム設定開姁E
    // ========================================================

    socket.on(
      'hawk:start-setup',
      (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          hawkGames.get(
            roomId
          );

        const room =
          freeRooms.get(
            roomId
          );

        if (
          !game ||
          !room
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'ゲーム部屋が見つかりません、E,
            }
          );

          return;
        }

        if (
          room.hostSocketId !==
          socket.id
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'ゲーム設定を変更できるのは部屋主だけです、E,
            }
          );

          return;
        }

        game.phase =
          'setup';

        socket.emit(
          'hawk:setup',
          {
            interval:
              game.interval ||
              10,
          }
        );

        hawkBroadcastRoomState(
          game
        );
      }
    );


    // ========================================================
    // ゲーム開姁E
    // ========================================================

    socket.on(
      'hawk:start-game',
      async (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const interval =
          Number(
            payload?.interval
          );

        const game =
          hawkGames.get(
            roomId
          );

        const room =
          freeRooms.get(
            roomId
          );

        if (
          !game ||
          !room
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'ゲーム部屋が見つかりません、E,
            }
          );

          return;
        }

        if (
          room.hostSocketId !==
          socket.id
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'ゲームを開始できるのは部屋主です、E,
            }
          );

          return;
        }

        const playerCount =
          room.players instanceof Map
            ? room.players.size
            : Array.isArray(
                room.players
              )
              ? room.players.length
              : 0;

        if (
          playerCount < 2
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'ミス・フライチE�Eのえじき�E2人以上忁E��です、E,
            }
          );

          return;
        }

        if (
          playerCount > 4
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'ミス・フライチE�Eのえじき�E4人までです、E,
            }
          );

          return;
        }

        if (
          !Number.isInteger(
            interval
          ) ||
          interval <= 0
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                '持E��間隔�E1以上�E整数にしてください、E,
            }
          );

          return;
        }

        try {
          await hawkStartGame(
            game,
            interval
          );
        } catch (
          error
        ) {
          console.error(
            '[hawk] start error',
            error
          );

          socket.emit(
            'hawk:error',
            {
              message:
                error?.message ||
                'ゲーム開始時にエラーが発生しました、E,
            }
          );
        }
      }
    );




    // ========================================================
    // カードを出ぁE
    // ========================================================

    socket.on(
      'hawk:play-card',
      (payload) => {

        console.log(
          '[hawk:play-card] RECEIVED',
          {
            socketId:
              socket.id,

            payload,
          }
        );

        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const cardId =
          String(
            payload?.cardId ||
              ''
          );

        const game =
          hawkGames.get(
            roomId
          );

        const room =
          freeRooms.get(
            roomId
          );

        if (
          !game ||
          !room
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'ゲーム部屋が見つかりません、E,
            }
          );

          return;
        }

        if (
          game.phase !==
          'playing'
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                '現在カードを出せる状態ではありません、E,
            }
          );

          return;
        }

        const incomingUserId =
          payload?.userId != null
            ? String(
                payload.userId
              )
            : '';

        const player =
          room.players instanceof Map
            ? Array.from(
                room.players.values()
              ).find(
                (item) => {
                  if (
                    incomingUserId &&
                    item.userId != null &&
                    String(
                      item.userId
                    ) ===
                      incomingUserId
                  ) {
                    return true;
                  }

                  return (
                    item.socketId ===
                    socket.id
                  );
                }
              )
            : room.players?.find(
                (item) => {
                  if (
                    incomingUserId &&
                    item.userId != null &&
                    String(
                      item.userId
                    ) ===
                      incomingUserId
                  ) {
                    return true;
                  }

                  return (
                    item.socketId ===
                    socket.id
                  );
                }
              );

        console.log(
          '[hawk:play-card] lookup:',
          {
            socketId:
              socket.id,

            incomingUserId,

            players:
              room.players instanceof Map
                ? Array.from(
                    room.players.values()
                  ).map(
                    (p) => ({
                      socketId:
                        p.socketId,

                      userId:
                        p.userId,

                      name:
                        p.name,
                    })
                  )
                : room.players,
          }
        );

        if (!player) {
          socket.emit(
            'hawk:error',
            {
              message:
                'ゲーム参加老E��はありません、E,
            }
          );

          return;
        }

        // ======================================================
        // プレイヤー識別
        // ======================================================

        const playerSocketId =
          player.socketId;

        // ======================================================
        // こ�Eラウンドですでにカードを出してぁE��か確誁E
        // ※ Extra Poker の処琁E�E使わなぁE
        // ======================================================

        if (
          game.played &&
          game.played[playerSocketId]
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'こ�Eラウンドでは既にカードを出してぁE��す、E,
            }
          );

          return;
        }

        /*
         * プレイヤー本人のSocket IDで手札を取得、E
         */
        const hand =
          game.hands[
            playerSocketId
          ];

        if (
          !Array.isArray(hand)
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                '手札が見つかりません、E,
            }
          );

          return;
        }

        if (
          !hand.includes(
            cardId
          )
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'そ�Eカード�E現在の手札にありません、E,
            }
          );

          return;
        }

        /*
         * 手札から削除、E
         */
        game.hands[
          playerSocketId
        ] =
          hand.filter(
            (id) =>
              id !==
              cardId
          );

        /*
         * 場に出したカードを記録、E
         */
        game.played[
          playerSocketId
        ] =
          cardId;

        console.log(
          '[hawk:play-card] SAVED',
          {
            roomId,
            playerSocketId,
            cardId,
            played:
              game.played,
          }
        );

        /*
         * 自刁E�E残り手札を更新、E
         */
        hawkSendMyCards(
          game,
          socket
        );

        /*
         * 全員出したか確認、E
         */
        const players =
          hawkGetPlayers(
            game
          );

        const allSubmitted =
          players.length > 0 &&
          players.every(
            (player) =>
              Boolean(
                game.played[
                  player.socketId
                ]
              )
          );

        console.log(
          '[hawk:play-card] SUBMISSION CHECK',
          {
            roomId,
            playerCount:
              players.length,
            playedCount:
              Object.keys(
                game.played || {}
              ).length,
            allSubmitted,
          }
        );

        if (
          !allSubmitted
        ) {
          return;
        }

        console.log(
          '[hawk:play-card] ALL SUBMITTED',
          roomId
        );

        /*
         * 全員公開、E
         */
        const result =
          hawkResolveRound(
            game
          );

        /*
         * 履歴を保存、E
         */
        const historyPlayed =
          players
            .map(
              (player) => {
                const id =
                  game.played[
                    player.socketId
                  ];

                const card =
                  game.cardMap[
                    id
                  ];

                if (!card) {
                  return null;
                }

                return {
                  socketId:
                    player.socketId,

                  playerName:
                    player.name ||
                    'プレイヤー',

                  cardId:
                    card.id,

                  name:
                    card.name,

                  rank:
                    card.rank,
                };
              }
            )
            .filter(Boolean);

        if (
          !Array.isArray(
            game.cardHistory
          )
        ) {
          game.cardHistory =
            [];
        }

        game.cardHistory.push({
          round:
            game.round,

          playedCards:
            historyPlayed,
        });

        game.phase =
          'result';

        /*
         * ラウンド結果を�E員へ、E
         */
        for (
          const player of players
        ) {
          const targetSocket =
            io.sockets.sockets.get(
              player.socketId
            );

          if (
            !targetSocket
          ) {
            continue;
          }

          targetSocket.emit(
            'hawk:round-result',
            {
              winnerName:
                result.winnerName,

              score:
                result.score,

              tieInfo:
                result.tieInfo,

              scores:
                hawkGetScores(
                  game
                ),
            }
          );
        }

        console.log(
          `[hawk] round=${game.round} room=${roomId} winner=${result.winnerName || 'none'} score=${result.score}`
        );

        /*
         * 15回戦終亁E��E
         */
        if (
          game.round >=
          HAWK_TOTAL_ROUNDS
        ) {
          hawkFinishGame(
            game
          );
        }
      }
    );


    // ========================================================
    // 次のラウンチE
    // ========================================================

    socket.on(
      'hawk:next-round',
      (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          hawkGames.get(
            roomId
          );

        const room =
          freeRooms.get(
            roomId
          );

        if (
          !game ||
          !room
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'ゲーム部屋が見つかりません、E,
            }
          );

          return;
        }

        if (
          room.hostSocketId !==
          socket.id
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                '次のラウンドを開始できるのは部屋主です、E,
            }
          );

          return;
        }

        if (
          game.phase !==
          'result'
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                '現在は次のラウンドへ進めません、E,
            }
          );

          return;
        }

        if (
          game.round >=
          HAWK_TOTAL_ROUNDS
        ) {
          hawkFinishGame(
            game
          );

          return;
        }

        game.round +=
          1;

        game.played =
          {};

        hawkEmitRoundStarted(
          game
        );

        hawkBroadcastRoomState(
          game
        );
      }
    );


    // ========================================================
    // 刁E��
    // ========================================================

    socket.on(
      'disconnect',
      () => {

        /*
         * Hawkゲームを確認、E
         */
        for (
          const [
            roomId,
            game,
          ] of hawkGames
        ) {
          const room =
            freeRooms.get(
              roomId
            );

          if (!room) {
            hawkGames.delete(
              roomId
            );

            continue;
          }

          const wasPlayer =
            room.players instanceof Map
              ? Array.from(
                  room.players.values()
                ).some(
                  (player) =>
                    player.socketId ===
                    socket.id
                )
              : Array.isArray(
                  room.players
                )
                ? room.players.some(
                    (player) =>
                      player.socketId ===
                      socket.id
                  )
                : false;

          if (
            !wasPlayer
          ) {
            continue;
          }

          /*
           * まだゲーム開始前なめE
           * free room側の処琁E��任せる、E
           */
          if (
            game.phase ===
            'setup'
          ) {
            hawkBroadcastRoomState(
              game
            );

            continue;
          }

          /*
           * ゲーム中に刁E��した場合、E
           */
          delete game.hands[
            socket.id
          ];

          delete game.played[
            socket.id
          ];

          delete game.scores[
            socket.id
          ];

          const remaining =
            hawkGetPlayers(
              game
            );

          /*
           * 残った�EレイヤーぁE人未満なら終亁E��E
           */
          if (
            remaining.length <
            2
          ) {
            game.phase =
              'finished';

            for (
              const player of
                remaining
            ) {
              const targetSocket =
                io.sockets.sockets.get(
                  player.socketId
                );

              if (
                targetSocket
              ) {
                targetSocket.emit(
                  'hawk:error',
                  {
                    message:
                      'プレイヤーが退出したため、ゲームを終亁E��ました、E,
                  }
                );
              }
            }

            hawkGames.delete(
              roomId
            );

            continue;
          }

          /*
           * 既に全員出してぁE��場合�E
           * 残ったメンバ�Eだけで判定、E
           */
          if (
            game.phase ===
            'playing'
          ) {
            const allSubmitted =
              remaining.every(
                (player) =>
                  Boolean(
                    game.played[
                      player.socketId
                    ]
                  )
              );

            if (
              allSubmitted
            ) {
              const result =
                hawkResolveRound(
                  game
                );

              game.phase =
                'result';

              for (
                const player of
                  remaining
              ) {
                const targetSocket =
                  io.sockets.sockets.get(
                    player.socketId
                  );

                if (
                  !targetSocket
                ) {
                  continue;
                }

                targetSocket.emit(
                  'hawk:round-result',
                  {
                    winnerName:
                      result.winnerName,

                    score:
                      result.score,

                    tieInfo:
                      result.tieInfo,

                    scores:
                      hawkGetScores(
                        game
                      ),
                  }
                );
              }
            }
          }

          hawkBroadcastRoomState(
            game
          );
        }
      }
    );
  }
);

// ============================================================
// エクストラポ�Eカー
// ============================================================
//
// 既存�E rate / free / Hawk 処琁E��は手を入れなぁE��E
// こ�EブロチE��めEserver.js の一番下に追加する、E
// ============================================================

const extraPokerGames = new Map();

const EXTRA_POKER_DEFAULT_CHIPS = 10000;
const EXTRA_POKER_DEFAULT_ROUNDS = 3;
const EXTRA_POKER_DEFAULT_MIN_BET = 100;
const EXTRA_POKER_DEFAULT_MAX_BET = 2000;


// ============================================================
// Excel読み込み
// ============================================================

async function loadExtraPokerData() {
  try {
    const XLSX = await import('xlsx');

    const workbook =
      XLSX.default?.readFile
        ? XLSX.default
        : XLSX;

    const fs =
      await import('node:fs');

    const path =
      await import('node:path');

    const absolutePath =
      path.join(
        process.cwd(),
        'data',
        'extra.xlsx'
      );

    if (
      !fs.existsSync(
        absolutePath
      )
    ) {
      throw new Error(
        `extra.xlsx が見つかりません: ${absolutePath}`
      );
    }

    const wb =
      workbook.readFile(
        absolutePath
      );

    const sheetName =
      wb.SheetNames?.[0];

    if (!sheetName) {
      throw new Error(
        'extra.xlsx にシートがありません、E
      );
    }

    const sheet =
      wb.Sheets[
        sheetName
      ];

    const rows =
      XLSX.utils.sheet_to_json(
        sheet,
        {
          header: 1,
          defval: '',
        }
      );

    const characters = [];

    for (
      let i = 0;
      i < rows.length;
      i += 1
    ) {
      const row =
        rows[i];

      if (
        !Array.isArray(row) ||
        row.length < 2
      ) {
        continue;
      }

      const name =
        String(
          row[0] ?? ''
        ).trim();

      const description =
        String(
          row[1] ?? ''
        ).trim();

      if (
        !name ||
        !description
      ) {
        continue;
      }

      characters.push({
        id:
          `extra-character-${i}`,

        name,

        description,
      });
    }

    if (
      characters.length === 0
    ) {
      throw new Error(
        'extra.xlsx からキャラクターを読み込めませんでした、E
      );
    }

    return characters;
  } catch (error) {
    console.error(
      '[extra-poker] extra.xlsx 読み込みエラー:',
      error
    );

    throw error;
  }
}


// ============================================================
// ExcelキャチE��ュ
// ============================================================

let extraPokerDataCache = null;

async function getExtraPokerData() {
  if (
    Array.isArray(
      extraPokerDataCache
    ) &&
    extraPokerDataCache.length > 0
  ) {
    return extraPokerDataCache;
  }

  extraPokerDataCache =
    await loadExtraPokerData();

  return extraPokerDataCache;
}


// ============================================================
// シャチE��ル
// ============================================================

function extraPokerShuffle(
  array
) {
  const result =
    [...array];

  for (
    let i =
      result.length - 1;
    i > 0;
    i -= 1
  ) {
    const j =
      Math.floor(
        Math.random() *
          (i + 1)
      );

    [
      result[i],
      result[j],
    ] = [
      result[j],
      result[i],
    ];
  }

  return result;
}


// ============================================================
// 斁E��種判宁E
// ============================================================

function extraPokerCharType(char) {
  if (char === 'ー') {
    return 'katakana';
  }

  if (
    /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u.test(
      char
    )
  ) {
    return 'kanji';
  }

  if (
    /[\u3040-\u309F]/u.test(
      char
    )
  ) {
    return 'hiragana';
  }

  if (
    /[\u30A0-\u30FF\u31F0-\u31FF\uFF66-\uFF9F]/u.test(
      char
    )
  ) {
    return 'katakana';
  }

  if (
    /\p{Number}/u.test(
      char
    )
  ) {
    return 'number';
  }

  return 'symbol';
}


// ============================================================
// 説明文をカード化
// ============================================================

function extraPokerBuildCards(description) {
  const chars = Array.from(
    String(description || '')
  );

  const groups = [];

  let currentType = null;
  let currentText = '';

  const flush = () => {
    if (!currentText) {
      return;
    }

    if (
      currentType === 'hiragana' &&
      Array.from(currentText).length === 1
    ) {
      currentText = '';
      return;
    }

    if (
      currentType !== 'symbol'
    ) {
      groups.push(currentText);
    }

    currentText = '';
  };

  for (
    const char of chars
  ) {
    const type =
      extraPokerCharType(char);

    if (
      type === 'symbol'
    ) {
      flush();

      currentType = null;

      continue;
    }

    if (
      currentType === null
    ) {
      currentType = type;
      currentText = char;

      continue;
    }

    if (
      type === currentType
    ) {
      currentText += char;

      continue;
    }

    flush();

    currentType = type;
    currentText = char;
  }

  flush();

  return groups.map(
    (
      text,
      index
    ) => ({
      id:
        `extra-card-${index}-${Math.random().toString(36).slice(2)}`,

      text,

      index,
    })
  );
}


// ============================================================
// プレイヤー取征E
// ============================================================

function extraPokerGetPlayers(
  game
) {
  const room =
    freeRooms.get(
      game.roomId
    );

  if (!room) {
    return [];
  }

  if (
    room.players instanceof Map
  ) {
    return Array.from(
      room.players.values()
    );
  }

  if (
    Array.isArray(
      room.players
    )
  ) {
    return room.players;
  }

  return [];
}


// ============================================================
// ゲーム参加老E��して有効なプレイヤー
// ============================================================

function extraPokerGetActivePlayers(
  game
) {
  return extraPokerGetPlayers(
    game
  ).filter(
    (player) =>
      Number(
        game.chips[
          player.socketId
        ] ?? 0
      ) > 0 &&
      !game.eliminated[
        player.socketId
      ]
  );
}


// ============================================================
// 現在のアクション対象プレイヤー
// ============================================================

function extraPokerGetActionPlayers(
  game
) {
  return extraPokerGetActivePlayers(
    game
  ).filter(
    (player) =>
      !game.folded[
        player.socketId
      ] &&
      !game.answerLost[
        player.socketId
      ]
  );
}


// ============================================================
// 公開用プレイヤー惁E��
// ============================================================

function extraPokerPublicPlayers(
  game
) {
  const players =
    extraPokerGetPlayers(
      game
    );

  return players.map(
    (player) => {
      const socketId =
        player.socketId;

      return {
        socketId,

        name:
          player.name ||
          'プレイヤー',

        playerNumber:
          player.playerNumber,

        chips:
          Number(
            game.chips[
              socketId
            ] ?? 0
          ),

        eliminated:
          Boolean(
            game.eliminated[
              socketId
            ]
          ),

        folded:
          Boolean(
            game.folded[
              socketId
            ]
          ),

        answerLost:
          Boolean(
            game.answerLost[
              socketId
            ]
          ),

        answerLocked:
          Boolean(
            game.answerLocked[
              socketId
            ]
          ),

        answerSubmitted:
          Boolean(
            game.answerSubmitted[
              socketId
            ]
          ),

        contribution:
          Number(
            game.contributions[
              socketId
            ] ?? 0
          ),

        handCount:
          Array.isArray(
            game.hands[
              socketId
            ]
          )
            ? game.hands[
                socketId
              ].length
            : 0,
      };
    }
  );
}


// ============================================================
// 自刁E�E手札送信
// ============================================================

function extraPokerSendMyHand(
  game,
  socket
) {
  if (!socket) {
    return;
  }

  const hand =
    game.hands[
      socket.id
    ];

  const cards =
    Array.isArray(
      hand
    )
      ? hand.map(
          (card) => ({
            id:
              card.id,

            text:
              card.text,

            index:
              card.index,
          })
        )
      : [];

  socket.emit(
    'extra-poker:my-hand',
    {
      cards,
    }
  );
}


// ============================================================
// 全員の状態送信
// ============================================================

function extraPokerBroadcastState(
  game
) {
  const players =
    extraPokerGetPlayers(
      game
    );

  const answerCandidates =
    extraPokerGetAnswerCandidates(
      game
    );

  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (!targetSocket) {
      continue;
    }

    extraPokerSendMyHand(
      game,
      targetSocket
    );

    /*
     * 回答�E力を許可するプレイヤー、E
     *
     * 「回答権を持ってぁE��、E
     * かつ
     * 「まだ回答してぁE��ぁE��E
     * 人だけ、E
     *
     * 全員に回答権一覧を送ること自体�E
     * ゲーム上問題なぁE��、E
     * UIでは自刁E��対象かどぁE��めE
     * 明確に判定できるようにする、E
     */
    const canSubmitAnswer =
      game.phase === 'answering' &&
      answerCandidates.some(
        (candidate) =>
          candidate.socketId ===
            player.socketId &&
          game.answerSubmitted[
            player.socketId
          ] !== true
      );

    targetSocket.emit(
      'extra-poker:state',
      {
        phase:
          game.phase,

        round:
          game.round,

        totalRounds:
          game.settings.rounds,

        turnNumber:
          game.turnNumber,

        turnStartPlayerId:
          game.turnStartPlayerId,

        currentCharacterName:
          null,

        pot:
          game.pot,

        currentBet:
          game.currentBet,

        minBet:
          game.settings.minBet,

        maxBet:
          game.settings.maxBet,

        currentActorId:
          game.currentActorId,

        cycle:
          game.cycle,

        players:
          extraPokerPublicPlayers(
            game
          ),

        /*
         * 回答権を持ってぁE��人、E
         */
        answerCandidates:
          answerCandidates.map(
            (candidate) =>
              candidate.socketId
          ),

        /*
         * 自刁E��回答�E力可能か、E
         *
         * UI側では基本皁E��
         * これを使って入力欁E��表示する、E
         */
        canSubmitAnswer,

        /*
         * 実際に回答を送信済みの人、E
         */
        answerers:
          Object.keys(
            game.answers
          ).filter(
            (socketId) =>
              game.answers[
                socketId
              ] != null &&
              game.answerSubmitted[
                socketId
              ] === true &&
              !game.answerLost[
                socketId
              ] &&
              !game.folded[
                socketId
              ]
          ),

        lastAction:
          game.lastAction ??
          null,

        cardsRemaining:
          Array.isArray(
            game.deck
          )
            ? game.deck.length
            : 0,
      }
    );
  }
}


// ============================================================
// 手札を�E員公閁E
// ============================================================

function extraPokerRevealHands(
  game
) {
  const players =
    extraPokerGetPlayers(
      game
    );

  const hands =
    players.map(
      (player) => ({
        socketId:
          player.socketId,

        name:
          player.name ||
          'プレイヤー',

        cards:
          (
            game.hands[
              player.socketId
            ] || []
          ).map(
            (card) =>
              card.text
          ),
      })
    );

  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      targetSocket
    ) {
      targetSocket.emit(
        'extra-poker:hands-revealed',
        {
          hands,
        }
      );
    }
  }
}


// ============================================================
// 設定作�E
// ============================================================

function extraPokerCreateSettings(
  payload
) {
  const initialChips =
    Number(
      payload?.initialChips
    );

  const rounds =
    Number(
      payload?.rounds
    );

  const minBet =
    Number(
      payload?.minBet
    );

  const maxBet =
    Number(
      payload?.maxBet
    );

  const safeInitialChips =
    Number.isInteger(
      initialChips
    ) &&
    initialChips >= 100
      ? initialChips
      : EXTRA_POKER_DEFAULT_CHIPS;

  const safeRounds =
    Number.isInteger(
      rounds
    ) &&
    rounds >= 1 &&
    rounds <= 20
      ? rounds
      : EXTRA_POKER_DEFAULT_ROUNDS;

  const safeMinBet =
    Number.isInteger(
      minBet
    ) &&
    minBet >= 100 &&
    minBet % 100 === 0
      ? minBet
      : EXTRA_POKER_DEFAULT_MIN_BET;

  const safeMaxBet =
    Number.isInteger(
      maxBet
    ) &&
    maxBet >= safeMinBet &&
    maxBet % 100 === 0
      ? maxBet
      : EXTRA_POKER_DEFAULT_MAX_BET;

  return {
    initialChips:
      safeInitialChips,

    rounds:
      safeRounds,

    minBet:
      safeMinBet,

    maxBet:
      safeMaxBet,
  };
}


// ============================================================
// ゲーム状態�E期化
// ============================================================

function extraPokerCreateGame(
  roomId
) {
  return {
    roomId,

    phase:
      'setup',

    settings: {
      initialChips:
        EXTRA_POKER_DEFAULT_CHIPS,

      rounds:
        EXTRA_POKER_DEFAULT_ROUNDS,

      minBet:
        EXTRA_POKER_DEFAULT_MIN_BET,

      maxBet:
        EXTRA_POKER_DEFAULT_MAX_BET,
    },

    round:
      0,

    turnNumber:
      0,

    turnStartPlayerId:
      null,

    currentActorId:
      null,

    cycle:
      0,

    cycleActors:
      [],

    cycleActed:
      {},

    character:
      null,

    deck:
      [],

    hands:
      {},

    chips:
      {},

    eliminated:
      {},

    folded:
      {},

    answerLost:
      {},

    answerLocked:
      {},

    answerSubmitted:
      {},

    answers:
      {},

    contributions:
      {},

    pot:
      0,

    currentBet:
      0,

    lastAction:
      null,

    result:
      null,
  };
}


// ============================================================
// スタート�Eレイヤー決宁E
// ============================================================

function extraPokerChooseStartPlayer(
  game
) {
  const players =
    extraPokerGetActivePlayers(
      game
    );

  if (
    players.length === 0
  ) {
    return null;
  }

  const randomIndex =
    Math.floor(
      Math.random() *
        players.length
    );

  return players[
    randomIndex
  ].socketId;
}


// ============================================================
// 時計回り�E次プレイヤー
// ============================================================

function extraPokerNextPlayer(
  game,
  socketId,
  options = {}
) {
  const includeFolded =
    options.includeFolded === true;

  const players =
    extraPokerGetActivePlayers(
      game
    );

  if (
    players.length === 0
  ) {
    return null;
  }

  /*
   * 座席頁E�E「players」�E頁E��を基準にする、E
   *
   * 重要E
   * フォールドした人を�Eに配�Eから消してしまぁE��、E
   *
   * A ↁEB ↁEC ↁED
   *
   * でBがフォールドしたとき、E
   * 「Bの次」を探せなくなってAに戻ってしまぁE��E
   *
   * そ�Eため、まず�Eの座席頁E��めE
   * 現在位置を探して、その後ろから
   * 生存してぁE��プレイヤーを探す、E
   */

  const currentIndex =
    players.findIndex(
      (player) =>
        player.socketId ===
        socketId
    );

  /*
   * 現在のプレイヤーぁE
   * playersに存在しなぁE��合、E
   *
   * これはゲーム開始時などに起こり得るので、E
   * 生存してぁE��プレイヤーの先頭を返す、E
   */
  if (
    currentIndex < 0
  ) {
    const usable =
      players.filter(
        (player) =>
          includeFolded ||
          (
            !game.folded[
              player.socketId
            ] &&
            !game.answerLost[
              player.socketId
            ]
          )
      );

    return (
      usable[0]?.socketId ??
      null
    );
  }

  /*
   * 現在プレイヤーの次の座席から
   * 時計回りに探す、E
   *
   * 自刁E�E身は返さなぁE��E
   */
  for (
    let i = 1;
    i <= players.length;
    i += 1
  ) {
    const player =
      players[
        (
          currentIndex + i
        ) %
          players.length
      ];

    if (
      includeFolded ||
      (
        !game.folded[
          player.socketId
        ] &&
        !game.answerLost[
          player.socketId
        ]
      )
    ) {
      return player.socketId;
    }
  }

  return null;
}

// ============================================================
// 頁E��を作る
// ============================================================

function extraPokerBuildCycle(
  game,
  firstSocketId
) {
  const players =
    extraPokerGetActivePlayers(
      game
    ).filter(
      (player) =>
        !game.folded[
          player.socketId
        ] &&
        !game.answerLost[
          player.socketId
        ]
    );

  if (
    players.length === 0
  ) {
    return [];
  }

  const index =
    players.findIndex(
      (player) =>
        player.socketId ===
        firstSocketId
    );

  if (
    index < 0
  ) {
    return players.map(
      (player) =>
        player.socketId
    );
  }

  const result = [];

  for (
    let i = 0;
    i < players.length;
    i += 1
  ) {
    result.push(
      players[
        (
          index + i
        ) %
          players.length
      ].socketId
    );
  }

  return result;
}


// ============================================================
// 山札から1枚�EめE
// ============================================================

function extraPokerDealOne(
  game,
  socketId
) {
  if (
    !Array.isArray(
      game.deck
    ) ||
    game.deck.length === 0
  ) {
    return false;
  }

  const card =
    game.deck.shift();

  if (
    !Array.isArray(
      game.hands[
        socketId
      ]
    )
  ) {
    game.hands[
      socketId
    ] = [];
  }

  game.hands[
    socketId
  ].push(
    card
  );

  return true;
}


// ============================================================
// 全員に初期カードを1枚ずつ配る
// ============================================================

function extraPokerDealInitialCards(
  game
) {
  const players =
    extraPokerGetActivePlayers(
      game
    );

  if (
    game.deck.length <
    players.length
  ) {
    return false;
  }

  for (
    const player of players
  ) {
    extraPokerDealOne(
      game,
      player.socketId
    );
  }

  return true;
}


// ============================================================
// 次のカードを全員に1枚ずつ配る
// ============================================================

function extraPokerDealNextCards(
  game
) {
  const players =
    extraPokerGetActivePlayers(
      game
    ).filter(
      (player) =>
        !game.folded[
          player.socketId
        ] &&
        !game.answerLost[
          player.socketId
        ]
    );

  if (
    players.length === 0
  ) {
    return false;
  }

  if (
    game.deck.length <
    players.length
  ) {
    return false;
  }

  for (
    const player of players
  ) {
    extraPokerDealOne(
      game,
      player.socketId
    );
  }

  return true;
}


// ============================================================
// チップをポットへ
// ============================================================

function extraPokerPutToPot(
  game,
  socketId,
  amount
) {
  const safeAmount =
    Math.max(
      0,
      Math.floor(
        Number(amount) || 0
      )
    );

  const chips =
    Number(
      game.chips[
        socketId
      ] ?? 0
    );

  if (
    safeAmount > chips
  ) {
    return false;
  }

  game.chips[
    socketId
  ] =
    chips -
    safeAmount;

  game.contributions[
    socketId
  ] =
    Number(
      game.contributions[
        socketId
      ] ?? 0
    ) +
    safeAmount;

  game.pot +=
    safeAmount;

  return true;
}


// ============================================================
// 初期ベッチE
// ============================================================

function extraPokerCollectInitialBet(
  game
) {
  const players =
    extraPokerGetActivePlayers(
      game
    );

  for (
    const player of players
  ) {
    const chips =
      Number(
        game.chips[
          player.socketId
        ] ?? 0
      );

    if (
      chips <
      game.settings.minBet
    ) {
      game.eliminated[
        player.socketId
      ] = true;

      continue;
    }

    const success =
      extraPokerPutToPot(
        game,
        player.socketId,
        game.settings.minBet
      );

    if (
      !success
    ) {
      game.eliminated[
        player.socketId
      ] = true;
    }
  }

  game.currentBet =
    game.settings.minBet;
}


// ============================================================
// 回答老E��覧
// ============================================================

function extraPokerGetAnswerers(
  game
) {
  return extraPokerGetActivePlayers(
    game
  ).filter(
    (player) =>
      !game.folded[
        player.socketId
      ] &&
      !game.answerLost[
        player.socketId
      ] &&
      game.answerLocked[
        player.socketId
      ] &&
      game.answerSubmitted[
        player.socketId
      ] &&
      game.answers[
        player.socketId
      ] != null
  );
}


// ============================================================
// 回答を選択した�Eレイヤー一覧
// ============================================================

function extraPokerGetAnswerCandidates(
  game
) {
  return extraPokerGetActivePlayers(
    game
  ).filter(
    (player) =>
      !game.folded[
        player.socketId
      ] &&
      !game.answerLost[
        player.socketId
      ] &&
      game.answerLocked[
        player.socketId
      ]
  );
}


// ============================================================
// 回答�E閁E
// ============================================================

function extraPokerPublicAnswers(
  game
) {
  const answerers =
    extraPokerGetAnswerers(
      game
    );

  return answerers.map(
    (player) => ({
      socketId:
        player.socketId,

      playerName:
        player.name ||
        'プレイヤー',

      answer:
        String(
          game.answers[
            player.socketId
          ] ?? ''
        ),
    })
  );
}


// ============================================================
// 回答正規化
// ============================================================

function extraPokerNormalizeAnswer(
  value
) {
  return String(
    value ?? ''
  )
    .normalize('NFKC')
    .replace(
      /\s+/g,
      ''
    )
    .toLowerCase()
    .trim();
}


// ============================================================
// 正解判宁E
// ============================================================

function extraPokerIsCorrectAnswer(
  game,
  answer
) {
  if (
    !game.character
  ) {
    return false;
  }

  const normalized =
    extraPokerNormalizeAnswer(
      answer
    );

  if (
    !normalized
  ) {
    return false;
  }

  const rawName =
    String(
      game.character.name
    );

  const candidates = [];

  // 允E�E名前そ�Eも�E
  candidates.push(
    rawName
  );

  // 「○○（△△�E�」�E場吁E
  // ・○○�E�△△�E�E
  // ・○○
  // ・△△
  // のすべてを正解候補にする
  const bracketMatch =
    rawName.match(
      /^(.*?)[�E�E]([^�E�E]+)[�E�E](.*)$/
    );

  if (
    bracketMatch
  ) {
    const before =
      bracketMatch[1];

    const inside =
      bracketMatch[2];

    const after =
      bracketMatch[3];

    // 括弧より剁E
    if (
      before.trim()
    ) {
      candidates.push(
        before
      );
    }

    // 括弧の中
    if (
      inside.trim()
    ) {
      candidates.push(
        inside
      );
    }

    // 括弧より後ろに斁E��がある場吁E
    if (
      after.trim()
    ) {
      candidates.push(
        after
      );
    }
  }

  return candidates.some(
    (candidate) =>
      extraPokerNormalizeAnswer(
        candidate
      ) ===
      normalized
  );
}

// ============================================================
// チッチE以下�Eプレイヤーを脱落
// ============================================================

function extraPokerUpdateEliminations(
  game
) {
  const players =
    extraPokerGetPlayers(
      game
    );

  for (
    const player of players
  ) {
    const chips =
      Number(
        game.chips[
          player.socketId
        ] ?? 0
      );

    if (
      chips <= 0
    ) {
      game.eliminated[
        player.socketId
      ] = true;
    }
  }
}


// ============================================================
// ラウンド終亁E��宁E
// ============================================================

function extraPokerCheckRoundEnd(
  game
) {
  extraPokerUpdateEliminations(
    game
  );

  const alive =
    extraPokerGetActivePlayers(
      game
    );

  return (
    alive.length <= 1
  );
}


// ============================================================
// ゲーム最終結果
// ============================================================

function extraPokerBuildFinalResults(
  game
) {
  const players =
    extraPokerGetPlayers(
      game
    );

  return players
    .map(
      (player) => ({
        socketId:
          player.socketId,

        name:
          player.name ||
          'プレイヤー',

        chips:
          Number(
            game.chips[
              player.socketId
            ] ?? 0
          ),
      })
    )
    .sort(
      (a, b) =>
        b.chips -
        a.chips
    )
    .map(
      (
        player,
        index
      ) => ({
        ...player,

        rank:
          index + 1,
      })
    );
}


// ============================================================
// ゲーム終亁E
// ============================================================

function extraPokerFinishGame(
  game
) {
  game.phase =
    'finished';

  const results =
    extraPokerBuildFinalResults(
      game
    );

  const players =
    extraPokerGetPlayers(
      game
    );

  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      targetSocket
    ) {
      targetSocket.emit(
        'extra-poker:game-finished',
        {
          results,
        }
      );
    }
  }

  extraPokerBroadcastState(
    game
  );
}


// ============================================================
// ターン終亁E
// ============================================================

async function extraPokerEndTurn(
  game,
  reason,
  winnerSocketIds = []
) {
  const players =
    extraPokerGetPlayers(
      game
    );

  const winners =
    new Set(
      winnerSocketIds.filter(
        (socketId) =>
          typeof socketId ===
            'string' &&
          socketId.length > 0
      )
    );

  const potBefore =
    Number(
      game.pot || 0
    );

  if (
    winners.size > 0 &&
    potBefore > 0
  ) {
    const winnerIds =
      [...winners];

    const base =
      Math.floor(
        potBefore /
          winnerIds.length
      );

    let remainder =
      potBefore %
      winnerIds.length;

    for (
      const socketId of
        winnerIds
    ) {
      const add =
        base +
        (
          remainder > 0
            ? 1
            : 0
        );

      if (
        remainder > 0
      ) {
        remainder -= 1;
      }

      game.chips[
        socketId
      ] =
        Number(
          game.chips[
            socketId
          ] ?? 0
        ) +
        add;
    }
  }

  game.pot =
    0;

  const hasWinner =
    winners.size > 0;

  const revealedCharacterName =
  game.character
    ? String(
        game.character.name ?? ''
      )
    : '';

const revealedDescription =
  game.character
    ? String(
        game.character.description ?? ''
      )
    : '';

  console.log(
    '[extra-poker] 正解キャラクター:',
    revealedCharacterName
  );

  console.log(
    '[extra-poker] 正解説明文:',
    revealedDescription
  );

  console.log(
    '[extra-poker] 正解説明文斁E��数:',
    revealedDescription.length
  );

  const publicAnswers =
    extraPokerPublicAnswers(
      game
    );

 game.result = {
  reason,

  winnerSocketIds:
    [...winners],

  pot:
    potBefore,

  answers:
    publicAnswers,

  /*
   * 正解老E��ぁE��くてめE
   * 正解キャラクターを�E開する、E
   */
  characterName:
    revealedCharacterName,

  description:
    revealedDescription,

  hasWinner,
};

  if (
    hasWinner
  ) {
    extraPokerRevealHands(
      game
    );
  }

  game.phase =
    'turn-result';

  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      !targetSocket
    ) {
      continue;
    }

    const payload = {
  reason,

  /*
   * 正解老E��0人でめE
   * 正解キャラクターを表示する、E
   */
  characterName:
    revealedCharacterName,

  description:
    revealedDescription,

  answers:
    publicAnswers,

  winnerSocketIds:
    [...winners],

  pot:
    potBefore,

  players:
    extraPokerPublicPlayers(
      game
    ),

  round:
    game.round,

  turnNumber:
    game.turnNumber,

  hasWinner,
};

    targetSocket.emit(
      'extra-poker:turn-result',
      payload
    );
  }

  extraPokerBroadcastState(
    game
  );
}


// ============================================================
// 次のターンを開姁E
// ============================================================

async function extraPokerStartTurn(
  game,
  preferredStartSocketId = null
) {
  const data =
    await getExtraPokerData();

  extraPokerUpdateEliminations(
    game
  );

  const players =
    extraPokerGetActivePlayers(
      game
    );

  if (
    players.length <= 1
  ) {
    extraPokerFinishGame(
      game
    );

    return;
  }

  const character =
    data[
      Math.floor(
        Math.random() *
          data.length
      )
    ];

  const cards =
    extraPokerShuffle(
      extraPokerBuildCards(
        character.description
      )
    );

  game.character =
    character;

  game.deck =
    cards;

  game.hands =
    {};

  game.folded =
    {};

  game.answerLost =
    {};

  game.answerLocked =
    {};

  game.answerSubmitted =
    {};

  game.answers =
    {};

  game.contributions =
    {};

  game.pot =
    0;

  game.currentBet =
    0;

  game.cycle =
    0;

  game.cycleActors =
    [];

  game.cycleActed =
    {};

  game.lastAction =
    null;

  game.result =
    null;

  game.turnNumber +=
    1;

  let startId =
    preferredStartSocketId;

  if (
    !startId ||
    !players.some(
      (player) =>
        player.socketId ===
        startId
    )
  ) {
    const previousStartId =
      game.turnStartPlayerId;

    if (
      previousStartId
    ) {
      const previousIndex =
        players.findIndex(
          (player) =>
            player.socketId ===
            previousStartId
        );

      if (
        previousIndex >= 0
      ) {
        startId =
          players[
            (
              previousIndex +
              1
            ) %
              players.length
          ].socketId;
      }
    }

    if (
      !startId
    ) {
      startId =
        extraPokerChooseStartPlayer(
          game
        );
    }
  }

  game.turnStartPlayerId =
    startId;

  for (
    const player of players
  ) {
    game.hands[
      player.socketId
    ] = [];

    game.folded[
      player.socketId
    ] = false;

    game.answerLost[
      player.socketId
    ] = false;

    game.answerLocked[
      player.socketId
    ] = false;

    game.answerSubmitted[
      player.socketId
    ] = false;

    game.answers[
      player.socketId
    ] = '';

    game.contributions[
      player.socketId
    ] = 0;
  }

  const initialSuccess =
    extraPokerDealInitialCards(
      game
    );

  if (
    !initialSuccess
  ) {
    await extraPokerEndTurn(
      game,
      '山札が足りず、�E員に初期カードを配れなかったためターンが流れました、E,
      []
    );

    return;
  }

  extraPokerCollectInitialBet(
    game
  );

  extraPokerUpdateEliminations(
    game
  );

  const aliveAfterAnte =
    extraPokerGetActivePlayers(
      game
    );

  if (
    aliveAfterAnte.length <= 1
  ) {
    extraPokerFinishGame(
      game
    );

    return;
  }

  game.currentBet =
    game.settings.minBet;

 game.turnStartPlayerId =
  startId;

game.cycleActors =
  extraPokerBuildCycle(
    game,
    game.turnStartPlayerId
  );

game.cycleActed =
  {};

game.currentActorId =
  game.turnStartPlayerId;

if (
  !game.cycleActors.includes(
    game.currentActorId
  )
) {
  game.currentActorId =
    game.cycleActors[0] ??
    null;
}

  game.phase =
    'playing';

  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      targetSocket
    ) {
      targetSocket.emit(
        'extra-poker:turn-started',
        {
          round:
            game.round,

          turnNumber:
            game.turnNumber,

          startPlayerId:
            game.turnStartPlayerId,

          cardsRemaining:
            game.deck.length,

          currentBet:
            game.currentBet,

          pot:
            game.pot,
        }
      );
    }
  }

  extraPokerBroadcastState(
    game
  );
}


// ============================================================
// サイクル終亁E
// ============================================================

async function extraPokerFinishCycle(
  game
) {
  /*
   * ==========================================================
   * 回答フェーズ
   * ==========================================================
   */

  if (
    game.phase ===
    'answering'
  ) {
    const answerCandidates =
      extraPokerGetAnswerCandidates(
        game
      );

    const allSubmitted =
      answerCandidates.every(
        (player) =>
          game.answerSubmitted[
            player.socketId
          ] === true
      );

    if (
      !allSubmitted
    ) {
      extraPokerBroadcastState(
        game
      );

      return;
    }

    const evaluations =
      answerCandidates.map(
        (player) => {
          const answer =
            String(
              game.answers[
                player.socketId
              ] ?? ''
            );

          return {
            socketId:
              player.socketId,

            playerName:
              player.name ||
              'プレイヤー',

            answer,

            correct:
              extraPokerIsCorrectAnswer(
                game,
                answer
              ),
          };
        }
      );

    for (
      const player of
        extraPokerGetPlayers(
          game
        )
    ) {
      const targetSocket =
        io.sockets.sockets.get(
          player.socketId
        );

      if (
        targetSocket
      ) {
        targetSocket.emit(
          'extra-poker:answers-revealed',
          {
            answers:
              evaluations,

            characterName:
              null,

            hasWinner:
              evaluations.some(
                (item) =>
                  item.correct === true
              ),
          }
        );
      }
    }

    const correctAnswers =
      evaluations.filter(
        (item) =>
          item.correct === true
      );

    if (
      correctAnswers.length > 0
    ) {
      await extraPokerEndTurn(
        game,
        '正解老E��出ました、E,
        correctAnswers.map(
          (item) =>
            item.socketId
        )
      );

      return;
    }

    /*
     * 全員不正解、E
     */
    for (
      const item of evaluations
    ) {
      game.answerLost[
        item.socketId
      ] = true;

      game.answerLocked[
        item.socketId
      ] = false;

      game.answerSubmitted[
        item.socketId
      ] = false;

      delete game.answers[
        item.socketId
      ];
    }

    extraPokerUpdateEliminations(
      game
    );

    const remainingPlayers =
      extraPokerGetActionPlayers(
        game
      );

    if (
      remainingPlayers.length ===
      1
    ) {
      const lastPlayer =
        remainingPlayers[0];

      while (
        game.deck.length > 0
      ) {
        extraPokerDealOne(
          game,
          lastPlayer.socketId
        );
      }

      game.currentActorId =
        lastPlayer.socketId;

      game.phase =
        'last-answer';

      game.answerLocked[
        lastPlayer.socketId
      ] = true;

      game.answerSubmitted[
        lastPlayer.socketId
      ] = false;

      game.answers[
        lastPlayer.socketId
      ] = '';

      const targetSocket =
        io.sockets.sockets.get(
          lastPlayer.socketId
        );

      if (
        targetSocket
      ) {
        targetSocket.emit(
          'extra-poker:last-answer',
          {
            characterName:
              null,

            message:
              'あなたに残りの山札がすべて公開されました。最後�E1回だけ回答できます、E,
          }
        );
      }

      extraPokerBroadcastState(
        game
      );

      return;
    }

    if (
      remainingPlayers.length ===
      0
    ) {
      await extraPokerEndTurn(
        game,
        '全員の回答権がなくなり、正解老E��出ませんでした、E,
        []
      );

      return;
    }

    const dealSuccess =
      extraPokerDealNextCards(
        game
      );

    if (
      !dealSuccess
    ) {
      await extraPokerEndTurn(
        game,
        '山札がなくなり、正解老E��出ませんでした、E,
        []
      );

      return;
    }

    game.cycle +=
      1;

    game.cycleActed =
      {};

    for (
      const player of
        extraPokerGetPlayers(
          game
        )
    ) {
      game.answerLocked[
        player.socketId
      ] = false;

      game.answerSubmitted[
        player.socketId
      ] = false;

      game.answers[
        player.socketId
      ] = '';
    }

    const nextStart =
      game.turnStartPlayerId;

    game.cycleActors =
      extraPokerBuildCycle(
        game,
        nextStart
      );

    game.currentActorId =
      game.cycleActors[0] ??
      null;

    game.lastAction =
      null;

    game.phase =
      'playing';

    extraPokerBroadcastState(
      game
    );

    return;
  }


  /*
   * ==========================================================
   * 通常のベッチE��ング終亁E
   * ==========================================================
   */

  const answerCandidates =
    extraPokerGetAnswerCandidates(
      game
    );

  /*
   * 回答権を持つプレイヤーがいる場合だぁE
   * 回答フェーズへ、E
   */
  if (
    answerCandidates.length > 0
  ) {
    game.phase =
      'answering';

    game.currentActorId =
      null;

    /*
     * ここで回答�E力可能になる、E
     *
     * 回答権を持ってぁE��人だけが
     * canSubmitAnswer=true になる、E
     */
    for (
      const player of
        answerCandidates
    ) {
      game.answerSubmitted[
        player.socketId
      ] = false;

      game.answers[
        player.socketId
      ] = '';
    }

    extraPokerBroadcastState(
      game
    );

    return;
  }

  /*
   * ==========================================================
   * 回答老E��ぁE
   * ==========================================================
   */

  const dealSuccess =
    extraPokerDealNextCards(
      game
    );

  if (
    !dealSuccess
  ) {
    await extraPokerEndTurn(
      game,
      '山札がなくなり、正解老E��出ませんでした、E,
      []
    );

    return;
  }

  game.cycle +=
    1;

  game.cycleActed =
    {};

  for (
    const player of
      extraPokerGetPlayers(
        game
      )
  ) {
    game.answerLocked[
      player.socketId
    ] = false;

    game.answerSubmitted[
      player.socketId
    ] = false;

    game.answers[
      player.socketId
    ] = '';
  }

 const nextStart =
  game.turnStartPlayerId;

game.cycleActors =
  extraPokerBuildCycle(
    game,
    nextStart
  );

  game.currentActorId =
    game.cycleActors[0] ??
    null;

  game.lastAction =
    null;

  game.phase =
    'playing';

  extraPokerBroadcastState(
    game
  );
}


// ============================================================
// アクション可能判宁E
// ============================================================

function extraPokerCanAct(
  game,
  socketId
) {
  if (
    game.phase !==
    'playing'
  ) {
    return false;
  }

  if (
    game.currentActorId !==
    socketId
  ) {
    return false;
  }

  if (
    game.folded[
      socketId
    ] ||
    game.answerLost[
      socketId
    ]
  ) {
    return false;
  }

  return true;
}


// ============================================================
// 次のアクションプレイヤー
// ============================================================
//

function extraPokerAdvanceActor(
  game
) {
  /*
   * cycleActorsは
   * 「このサイクル開始時点での座席頁E��E
   * として使ぁE��E
   *
   * フォールドした�EレイヤーめE
   * 配�Eから削除してはぁE��なぁE��E
   *
   * A ↁEB ↁEC ↁED
   *
   * BがフォールドしてめE
   *
   * A ↁEB ↁEC ↁED
   *
   * の座席頁E��維持し、E
   * Bを飛�EしてCへ進める、E
   */

  const actors =
    (
      game.cycleActors ||
      []
    ).filter(
      (socketId) =>
        !game.folded[
          socketId
        ] &&
        !game.answerLost[
          socketId
        ]
    );

  if (
    actors.length === 0
  ) {
    game.currentActorId =
      null;

    return false;
  }

  /*
   * 現在のプレイヤーぁE
   * 生存�Eレイヤー一覧から消えてぁE��場合、E
   *
   * 例えば現在のBがフォールドした直後など、E
   *
   * こ�E場合�EcycleActors全体かめE
   * Bの位置を探して、その次から
   * 生存�Eレイヤーを探す、E
   */
  const allCycleActors =
    game.cycleActors || [];

  let currentIndex =
    allCycleActors.indexOf(
      game.currentActorId
    );

  /*
   * 現在のプレイヤーが見つからなぁE��合�E、E
   * cycleActorsの先頭から探す、E
   */
  if (
    currentIndex < 0
  ) {
    currentIndex = 0;
  }

  /*
   * 現在プレイヤーの次から、E
   * 時計回りに「まだ行動してぁE��ぁE��」を探す、E
   */
  for (
    let i = 1;
    i <= allCycleActors.length;
    i += 1
  ) {
    const candidate =
      allCycleActors[
        (
          currentIndex + i
        ) %
          allCycleActors.length
      ];

    /*
     * フォールド�E回答権喪失老E�E飛�Eす、E
     */
    if (
      game.folded[
        candidate
      ] ||
      game.answerLost[
        candidate
      ]
    ) {
      continue;
    }

    /*
     * まだ今回のサイクルで
     * 行動してぁE��ぁE��を優先、E
     */
    if (
      !game.cycleActed[
        candidate
      ]
    ) {
      game.currentActorId =
        candidate;

      return true;
    }
  }

  /*
   * 全員が今回一度行動した、E
   *
   * それでも現在の最高額に
   * 届いてぁE��ぁE��がいる場合�E、E
   * そ�E人だけもぁE��度行動させる、E
   */
  const needsAction =
    actors.filter(
      (socketId) =>
        Number(
          game.contributions[
            socketId
          ] ?? 0
        ) <
        Number(
          game.currentBet ||
          0
        )
    );

  if (
    needsAction.length === 0
  ) {
    game.currentActorId =
      null;

    return false;
  }

  /*
   * 最高額に届いてぁE��ぁE��だぁE
   * 次の一周の対象にする、E
   */
  for (
    const socketId of
      actors
  ) {
    game.cycleActed[
      socketId
    ] =
      !needsAction.includes(
        socketId
      );
  }

  /*
   * 座席頁E��維持して
   * 最初に差額が忁E��なプレイヤーを探す、E
   */
  for (
    let i = 1;
    i <= allCycleActors.length;
    i += 1
  ) {
    const candidate =
      allCycleActors[
        (
          currentIndex + i
        ) %
          allCycleActors.length
      ];

    if (
      needsAction.includes(
        candidate
      )
    ) {
      game.currentActorId =
        candidate;

      return true;
    }
  }

  /*
   * 念のため、E
   */
  game.currentActorId =
    null;

  return false;
}

// ============================================================
// ベッチE��ングサイクル終亁E��宁E
// ============================================================

function extraPokerCycleComplete(
  game
) {
  const actors =
    game.cycleActors.filter(
      (socketId) =>
        !game.folded[
          socketId
        ] &&
        !game.answerLost[
          socketId
        ]
    );

  if (
    actors.length === 0
  ) {
    return true;
  }

  const allActed =
    actors.every(
      (socketId) =>
        Boolean(
          game.cycleActed[
            socketId
          ]
        )
    );

  if (
    !allActed
  ) {
    return false;
  }

  const allMatched =
    actors.every(
      (socketId) =>
        Number(
          game.contributions[
            socketId
          ] ?? 0
        ) >=
        Number(
          game.currentBet ||
          0
        )
    );

  return allMatched;
}


// ============================================================
// Socket.IO
// ============================================================

io.on(
  'connection',
  (socket) => {

    // ========================================================
    // JOIN
    // ========================================================

    socket.on(
      'extra-poker:join',
      async (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        if (
          roomId.length !== 4
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                '部屋IDが正しくありません、E,
            }
          );

          return;
        }

        const room =
          freeRooms.get(
            roomId
          );

        if (!room) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'フリーマッチE��屋が見つかりません、E,
            }
          );

          return;
        }

        const incomingUserId =
          payload?.userId != null
            ? String(
                payload.userId
              )
            : '';

        const incomingName =
          String(
            payload?.name ||
              ''
          ).trim();

        const players =
          room.players instanceof Map
            ? Array.from(
                room.players.values()
              )
            : Array.isArray(
                room.players
              )
              ? room.players
              : [];

        let playerIndex =
          players.findIndex(
            (player) =>
              player.socketId ===
              socket.id
          );

        if (
          playerIndex < 0 &&
          incomingUserId
        ) {
          playerIndex =
            players.findIndex(
              (player) =>
                player.userId != null &&
                String(
                  player.userId
                ) ===
                  incomingUserId
            );
        }

        if (
          playerIndex < 0 &&
          incomingName
        ) {
          const sameName =
            players.filter(
              (player) =>
                String(
                  player.name ||
                    ''
                ).trim() ===
                incomingName
            );

          if (
            sameName.length ===
            1
          ) {
            playerIndex =
              players.findIndex(
                (player) =>
                  String(
                    player.name ||
                      ''
                  ).trim() ===
                  incomingName
              );
          }
        }

        if (
          playerIndex < 0
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'こ�E部屋�E参加老E��はありません、E,
            }
          );

          return;
        }

        const player =
          players[
            playerIndex
          ];

        const oldSocketId =
          player.socketId;

        const wasHost =
          oldSocketId ===
            room.hostSocketId ||
          (
            player.userId != null &&
            room.hostUserId != null &&
            String(
              player.userId
            ) ===
              String(
                room.hostUserId
              )
          );

        if (
          oldSocketId &&
          oldSocketId !==
            socket.id
        ) {
          const oldSocket =
            io.sockets.sockets.get(
              oldSocketId
            );

          if (
            oldSocket
          ) {
            oldSocket.leave(
              `free:${roomId}`
            );
          }
        }

        player.socketId =
          socket.id;

        if (
          wasHost
        ) {
          room.hostSocketId =
            socket.id;
        }

        let game =
          extraPokerGames.get(
            roomId
          );

        if (!game) {
          game =
            extraPokerCreateGame(
              roomId
            );

          extraPokerGames.set(
            roomId,
            game
          );
        }

        if (
          oldSocketId &&
          oldSocketId !==
            socket.id
        ) {
          const keys = [
            'hands',
            'chips',
            'eliminated',
            'folded',
            'answerLost',
            'answerLocked',
            'answerSubmitted',
            'answers',
            'contributions',
          ];

          for (
            const key of keys
          ) {
            if (
              game[key] &&
              game[key][
                oldSocketId
              ] !== undefined
            ) {
              game[key][
                socket.id
              ] =
                game[key][
                  oldSocketId
                ];

              delete game[key][
                oldSocketId
              ];
            }
          }

          if (
            game.currentActorId ===
            oldSocketId
          ) {
            game.currentActorId =
              socket.id;
          }

          if (
            game.turnStartPlayerId ===
            oldSocketId
          ) {
            game.turnStartPlayerId =
              socket.id;
          }

          game.cycleActors =
            (
              game.cycleActors ||
              []
            ).map(
              (id) =>
                id ===
                oldSocketId
                  ? socket.id
                  : id
            );

          if (
            game.cycleActed &&
            game.cycleActed[
              oldSocketId
            ] !== undefined
          ) {
            game.cycleActed[
              socket.id
            ] =
              game.cycleActed[
                oldSocketId
              ];

            delete game.cycleActed[
              oldSocketId
            ];
          }
        }

        if (
          game.phase !==
            'setup' &&
          !game.hands[
            socket.id
          ]
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'こ�Eゲームはすでに開始されてぁE��す、E,
            }
          );

          return;
        }

        socket.join(
          `extra-poker:${roomId}`
        );

        socket.emit(
          'extra-poker:connected'
        );

        extraPokerBroadcastState(
          game
        );
      }
    );


    // ========================================================
    // SETUP
    // ========================================================

    socket.on(
      'extra-poker:start-setup',
      (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          extraPokerGames.get(
            roomId
          );

        const room =
          freeRooms.get(
            roomId
          );

        if (
          !game ||
          !room
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'ゲーム部屋が見つかりません、E,
            }
          );

          return;
        }

        if (
          room.hostSocketId !==
          socket.id
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'ゲーム設定を変更できるのは部屋主だけです、E,
            }
          );

          return;
        }

        game.phase =
          'setup';

        socket.emit(
          'extra-poker:setup',
          {
            ...game.settings,
          }
        );

        extraPokerBroadcastState(
          game
        );
      }
    );


    // ========================================================
    // START GAME
    // ========================================================

    socket.on(
      'extra-poker:start-game',
      async (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          extraPokerGames.get(
            roomId
          );

        const room =
          freeRooms.get(
            roomId
          );

        if (
          !game ||
          !room
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'ゲーム部屋が見つかりません、E,
            }
          );

          return;
        }

        if (
          room.hostSocketId !==
          socket.id
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'ゲームを開始できるのは部屋主です、E,
            }
          );

          return;
        }

        const players =
          extraPokerGetPlayers(
            game
          );

        if (
          players.length < 2
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'エクストラポ�Eカーは2人以上忁E��です、E,
            }
          );

          return;
        }

        if (
          players.length > 4
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'エクストラポ�Eカーは4人までです、E,
            }
          );

          return;
        }

        const settings =
          extraPokerCreateSettings(
            payload
          );

        game.settings =
          settings;

        game.round =
          1;

        game.turnNumber =
          0;

        game.phase =
          'setup';

        game.chips =
          {};

        game.eliminated =
          {};

        game.folded =
          {};

        game.answerLost =
          {};

        game.answerLocked =
          {};

        game.answerSubmitted =
          {};

        game.answers =
          {};

        game.contributions =
          {};

        game.pot =
          0;

        game.currentBet =
          0;

        game.result =
          null;

        for (
          const player of players
        ) {
          game.chips[
            player.socketId
          ] =
            settings.initialChips;

          game.eliminated[
            player.socketId
          ] = false;
        }

        try {
          await extraPokerStartTurn(
            game,
            extraPokerChooseStartPlayer(
              game
            )
          );
        } catch (
          error
        ) {
          console.error(
            '[extra-poker] start error:',
            error
          );

          socket.emit(
            'extra-poker:error',
            {
              message:
                error?.message ||
                'ゲーム開始時にエラーが発生しました、E,
            }
          );
        }
      }
    );


    // ========================================================
    // ACTION
    // ========================================================

    socket.on(
      'extra-poker:action',
      async (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          extraPokerGames.get(
            roomId
          );

        const room =
          freeRooms.get(
            roomId
          );

        if (
          !game ||
          !room
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'ゲーム部屋が見つかりません、E,
            }
          );

          return;
        }

        const incomingUserId =
          payload?.userId != null
            ? String(
                payload.userId
              )
            : '';

        const player =
          room.players instanceof Map
            ? Array.from(
                room.players.values()
              ).find(
                (item) =>
                  (
                    incomingUserId &&
                    item.userId != null &&
                    String(
                      item.userId
                    ) ===
                      incomingUserId
                  ) ||
                  item.socketId ===
                    socket.id
              )
            : room.players?.find(
                (item) =>
                  (
                    incomingUserId &&
                    item.userId != null &&
                    String(
                      item.userId
                    ) ===
                      incomingUserId
                  ) ||
                  item.socketId ===
                    socket.id
            );

        if (!player) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'ゲーム参加老E��はありません、E,
            }
          );

          return;
        }

        const playerSocketId =
          player.socketId;

        const action =
          String(
            payload?.action ||
              ''
          );

        /*
         * ======================================================
         * RE-ANSWER
         * ======================================================
         *
         * 回答フェーズでは
         * 「現在の手番」とぁE��概念を使わなぁE��E
         *
         * 回答権を持ってぁE��プレイヤーなめE
         * 自刁E�Eタイミングで回答を送信できる、E
         *
         * これが今回の
         * 「解答権を持った�Eレイヤーのみに
         * 入力欁E��出る、E
         * とぁE��仕様�E本体、E
         */

        if (
          action ===
          'reanswer'
        ) {
          if (
            game.phase !==
            'answering'
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  '現在は回答�E力�E時間ではありません、E,
              }
            );

            return;
          }

          if (
            game.folded[
              playerSocketId
            ] ||
            game.answerLost[
              playerSocketId
            ] ||
            !game.answerLocked[
              playerSocketId
            ]
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  '現在回答権を持ってぁE��せん、E,
              }
            );

            return;
          }



          const answer =
            String(
              payload?.answer ??
                ''
            ).trim();

          if (
            !answer
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  'キャラクター名を入力してください、E,
              }
            );

            return;
          }

          /*
           * 回答�E力時には
           * 追加ベットを行わなぁE��E
           *
           * 「回答」を選択した時点で
           * ベット額�E確定済み、E
           */
          game.answers[
            playerSocketId
          ] =
            answer;

          game.answerSubmitted[
            playerSocketId
          ] = true;

          game.lastAction = {
            playerId:
              playerSocketId,

            playerName:
              player.name ||
              'プレイヤー',

            type:
              'answer-submit',

            amount:
              Number(
                game.contributions[
                  playerSocketId
                ] ?? 0
              ),
          };

          /*
           * 全回答老E��入力済みなめE
           * すぐ判定、E
           */
          const answerCandidates =
            extraPokerGetAnswerCandidates(
              game
            );

          const allSubmitted =
            answerCandidates.every(
              (candidate) =>
                game.answerSubmitted[
                  candidate.socketId
                ] === true
            );

          if (
            allSubmitted
          ) {
            await extraPokerFinishCycle(
              game
            );

            return;
          }

          extraPokerBroadcastState(
            game
          );

          return;
        }


        /*
         * ======================================================
         * 通常ベッチE��ング中の手番チェチE��
         * ======================================================
         */

        if (
          !extraPokerCanAct(
            game,
            playerSocketId
          )
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                '現在あなた�E手番ではありません、E,
            }
          );

          return;
        }

        const requestedBet =
          Number(
            payload?.bet
          );

        const answer =
          String(
            payload?.answer ??
              ''
          ).trim();

        const currentContribution =
          Number(
            game.contributions[
              playerSocketId
            ] ?? 0
          );

        const chips =
          Number(
            game.chips[
              playerSocketId
            ] ?? 0
          );

        // ======================================================
        // ANSWER
        // ======================================================

        if (
          action ===
          'answer'
        ) {
          /*
           * ====================================================
           * 回答選抁E
           * ====================================================
           *
           * 重要ルール
           *
           * 「回答」を新しく選択した場合�E、E
           * ベット額が変わらなくても忁E��
           * そ�E周の残りプレイヤーへ手番を回す、E
           *
           * 例！E
           *
           * A 100 コール
           * B 100 回筁E
           *
           * ↁE
           *
           * 金額�E揁E��てぁE��が、E
           * Bが新たに「回答」を選択した�Eで
           * C ↁED ↁEA と手番を回す、E
           *
           * 一方、E
           *
           * A 200 回答済み
           * A 200 回筁E
           *
           * のように、すでに回答済みのプレイヤーぁE
           * 同額で再度回答しただけなら、E
           * 新しい周回�E発生させなぁE��E
           */

          if (
            game.answerLost[
              playerSocketId
            ]
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  'すでに回答権を失ってぁE��す、E,
              }
            );

            return;
          }

          /*
           * ベット額�EチェチE��、E
           */
          if (
            !Number.isInteger(
              requestedBet
            ) ||
            requestedBet % 100 !== 0
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  'ベット�E100刻みです、E,
              }
            );

            return;
          }

          /*
           * 現在の最高額より低い金額�E不可、E
           */
          if (
            requestedBet <
            Number(
              game.currentBet ?? 0
            )
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  '現在の最高額以上で回答してください、E,
              }
            );

            return;
          }

          /*
           * 現在の自刁E�Eベット額、E
           */
          const currentContribution =
            Number(
              game.contributions[
                playerSocketId
              ] ?? 0
            );

          /*
           * 今回追加する金額、E
           */
          const need =
            Math.max(
              0,
              requestedBet -
                currentContribution
            );

          /*
           * 自刁E�Eチップ、E
           */
          const chips =
            Number(
              game.chips[
                playerSocketId
              ] ?? 0
            );

          if (
            need >
            chips
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  '持ってぁE��チップを趁E��て回答できません、E,
              }
            );

            return;
          }

          /*
           * 回答前の最高額、E
           */
          const previousCurrentBet =
            Number(
              game.currentBet ?? 0
            );

          /*
           * 今回の回答で最高額が上がるか、E
           */
          const raisesCurrentBet =
            requestedBet >
            previousCurrentBet;

          /*
           * こ�Eプレイヤーが、E
           * すでにこ�E周で「回答」を選択してぁE��か、E
           */
          const wasAlreadyAnswered =
            game.answerLocked[
              playerSocketId
            ] === true;

          /*
           * ====================================================
           * ベットをポットへ
           * ====================================================
           */
          if (
            need > 0
          ) {
            const success =
              extraPokerPutToPot(
                game,
                playerSocketId,
                need
              );

            if (!success) {
              socket.emit(
                'extra-poker:error',
                {
                  message:
                    'ベット�E琁E��失敗しました、E,
                }
              );

              return;
            }
          }

          /*
           * 自刁E�Eベット額を更新、E
           */
          game.contributions[
            playerSocketId
          ] =
            requestedBet;

          /*
           * 最高額を更新、E
           */
          if (
            raisesCurrentBet
          ) {
            game.currentBet =
              requestedBet;
          }

          /*
           * ====================================================
           * 回答を選択したことを記録
           * ====================================================
           */
          game.answerLocked[
            playerSocketId
          ] = true;

          /*
           * 今回の手番を消化、E
           */
          game.cycleActed[
            playerSocketId
          ] = true;

          game.lastAction = {
            playerId:
              playerSocketId,

            playerName:
              player.name ||
              'プレイヤー',

            type:
              'answer',

            amount:
              requestedBet,
          };

          /*
           * ====================================================
           * 「新しい回答」が発生したか
           * ====================================================
           *
           * これが今回の最重要E��刁E��E
           *
           * AぁE00コール
           * BぁE00回筁E
           *
           * の場合、E
           *
           * BはまだanswerLockedではなぁE�Eで
           *
           * wasAlreadyAnswered = false
           *
           * となる、E
           *
           * 金額が変わってぁE��くても、E
           * 「回答」とぁE��新しい選択が発生した�Eで
           * もう一周する、E
           */
          const isNewAnswer =
            !wasAlreadyAnswered;

          /*
           * ====================================================
           * ベット額が上がった場吁E
           * ====================================================
           *
           * 新しい最高額に届いてぁE��ぁE�EレイヤーだぁE
           * もう一度行動できるようにする、E
           */
          if (
            raisesCurrentBet
          ) {
            for (
              const socketId of
                game.cycleActors
            ) {
              if (
                game.folded[
                  socketId
                ] ||
                game.answerLost[
                  socketId
                ]
              ) {
                game.cycleActed[
                  socketId
                ] = true;

                continue;
              }

              const contribution =
                Number(
                  game.contributions[
                    socketId
                  ] ?? 0
                );

              game.cycleActed[
                socketId
              ] =
                contribution >=
                Number(
                  game.currentBet ?? 0
                );
            }

            /*
             * レイズした本人は行動済み、E
             */
            game.cycleActed[
              playerSocketId
            ] = true;
          }

           /*
           * ====================================================
           * 新規回答�E場吁E
           * ====================================================
           */

          if (
            isNewAnswer
          ) {

            for (
              const socketId of
                game.cycleActors
            ) {
              if (
                game.folded[
                  socketId
                ] ||
                game.answerLost[
                  socketId
                ]
              ) {
                game.cycleActed[
                  socketId
                ] = true;

                continue;
              }


              game.cycleActed[
                socketId
              ] =
                socketId ===
                playerSocketId;
            }


            game.cycleActed[
              playerSocketId
            ] = true;

            const canAdvance =
              extraPokerAdvanceActor(
                game
              );

            if (
              canAdvance
            ) {
              extraPokerBroadcastState(
                game
              );

              return;
            }
          }

          /*
           * ====================================================
           * レイズの場吁E
           * ====================================================
           *
           * 新しい最高額に届いてぁE��ぁE��がいるなめE
           * そ�E人へ手番を回す、E
           */
          if (
            raisesCurrentBet
          ) {
            const canAdvance =
              extraPokerAdvanceActor(
                game
              );

            if (
              canAdvance
            ) {
              extraPokerBroadcastState(
                game
              );

              return;
            }
          }

          /*
           * ====================================================
           * ここまで来た場吁E
           * ====================================================
           *
           * もう追加で回す忁E��がなぁE��E
           *
           * 全員が忁E��な行動を終えてぁE��なめE
           * 回答フェーズへ、E
           */
          if (
            extraPokerCycleComplete(
              game
            )
          ) {
            await extraPokerFinishCycle(
              game
            );

            return;
          }

          /*
           * 念のため、まだ行動してぁE��ぁE�EレイヤーぁE
           * 存在する場合�E手番を進める、E
           */
          const canAdvance =
            extraPokerAdvanceActor(
              game
            );

          if (
            canAdvance
          ) {
            extraPokerBroadcastState(
              game
            );

            return;
          }

          /*
           * 最終的にサイクルが完亁E��てぁE��なめE
           * 回答フェーズへ、E
           */
          if (
            extraPokerCycleComplete(
              game
            )
          ) {
            await extraPokerFinishCycle(
              game
            );

            return;
          }

          extraPokerBroadcastState(
            game
          );

          return;
        }

        // ======================================================
        // RAISE
        // ======================================================

        if (
          action ===
          'raise'
        ) {
          if (
            game.answerLocked[
              playerSocketId
            ]
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  '回答を選択した後�E、回答かフォールド�Eみです、E,
              }
            );

            return;
          }

          if (
            !Number.isInteger(
              requestedBet
            ) ||
            requestedBet % 100 !== 0
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  'ベット�E100刻みです、E,
              }
            );

            return;
          }

          if (
            requestedBet <=
            game.currentBet
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  'レイズは現在の最高額より高くしてください、E,
              }
            );

            return;
          }

          if (
            requestedBet >
            game.settings.maxBet
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  `ベット上限は${game.settings.maxBet}です。`,
              }
            );

            return;
          }

          const need =
            requestedBet -
            currentContribution;

          if (
            need >
            chips
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  '持ってぁE��チップを趁E��てレイズできません、E,
              }
            );

            return;
          }

          const success =
            extraPokerPutToPot(
              game,
              playerSocketId,
              need
            );

          if (!success) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  'ベット�E琁E��失敗しました、E,
              }
            );

            return;
          }

          /*
           * 最高額を更新、E
           */
          game.currentBet =
            requestedBet;

          /*
           * ====================================================
           * ここが通常ポ�Eカー型レイズの重要E��刁E
           * ====================================================
           *
           * レイズした本人だけ行動済み、E
           *
           * それ以外�E全員は
           * 「新しい最高額に合わせる、E
           * 忁E��があるため未行動に戻す、E
           *
           * これによって
           *
           * A レイズ300
           * ↁE
           * B
           * ↁE
           * C
           * ↁE
           * D
           *
           * とぁE��新しい一周が発生する、E
           */
          for (
            const socketId of
              game.cycleActors
          ) {
            game.cycleActed[
              socketId
            ] =
              socketId ===
              playerSocketId;
          }

          game.lastAction = {
            playerId:
              playerSocketId,

            playerName:
              player.name ||
              'プレイヤー',

            type:
              'raise',

            amount:
              requestedBet,
          };

          /*
           * レイズした本人以外�E
           * 次のプレイヤーへ、E
           */
          const canAdvance =
            extraPokerAdvanceActor(
              game
            );

          /*
           * レイズ直後�E
           * 他�Eプレイヤーがまだ
           * 新しい額に対応してぁE��ぁE�Eで、E
           * 通常ここではfalseにならなぁE��E
           *
           * 丁E��2人以上が脱落して
           * 全員揁E��た場合だけ終亁E��E
           */
          if (
            extraPokerCycleComplete(
              game
            )
          ) {
            await extraPokerFinishCycle(
              game
            );

            return;
          }

          if (
            canAdvance
          ) {
            extraPokerBroadcastState(
              game
            );
          }

          return;
        }


        // ======================================================
        // CALL
        // ======================================================

        if (
          action ===
          'call'
        ) {
          if (
            game.answerLocked[
              playerSocketId
            ]
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  '回答を選択した後�E、回答かフォールド�Eみです、E,
              }
            );

            return;
          }

          const target =
            game.currentBet;

          const need =
            Math.max(
              0,
              target -
                currentContribution
            );

          if (
            need >
            chips
          ) {
            socket.emit(
              'extra-poker:error',
              {
                message:
                  '現在の最高額までコールするチップがありません、E,
              }
            );

            return;
          }

          if (
            need > 0
          ) {
            const success =
              extraPokerPutToPot(
                game,
                playerSocketId,
                need
              );

            if (!success) {
              socket.emit(
                'extra-poker:error',
                {
                  message:
                    'ベット�E琁E��失敗しました、E,
                }
              );

              return;
            }
          }

          game.cycleActed[
            playerSocketId
          ] = true;

          game.lastAction = {
            playerId:
              playerSocketId,

            playerName:
              player.name ||
              'プレイヤー',

            type:
              'call',

            amount:
              target,
          };

          const canAdvance =
            extraPokerAdvanceActor(
              game
            );

          if (
            extraPokerCycleComplete(
              game
            )
          ) {
            await extraPokerFinishCycle(
              game
            );

            return;
          }

          if (
            canAdvance
          ) {
            extraPokerBroadcastState(
              game
            );
          }

          return;
        }


        // ======================================================
        // FOLD
        // ======================================================

        if (
          action ===
          'fold'
        ) {
          game.folded[
            playerSocketId
          ] = true;

          game.answerLost[
            playerSocketId
          ] = true;

          game.answerLocked[
            playerSocketId
          ] = false;

          game.answerSubmitted[
            playerSocketId
          ] = false;

          delete game.answers[
            playerSocketId
          ];

          game.cycleActed[
            playerSocketId
          ] = true;

          game.lastAction = {
            playerId:
              playerSocketId,

            playerName:
              player.name ||
              'プレイヤー',

            type:
              'fold',

            amount:
              0,
          };

          const remaining =
            extraPokerGetActionPlayers(
              game
            );

          if (
            remaining.length ===
            1
          ) {
            await extraPokerEndTurn(
              game,
              '他�E全員がフォールドしました、E,
              [
                remaining[0]
                  .socketId,
              ]
            );

            return;
          }

          const canAdvance =
            extraPokerAdvanceActor(
              game
            );

          if (
            extraPokerCycleComplete(
              game
            )
          ) {
            await extraPokerFinishCycle(
              game
            );

            return;
          }

          if (
            canAdvance
          ) {
            extraPokerBroadcastState(
              game
            );
          }

          return;
        }


        socket.emit(
          'extra-poker:error',
          {
            message:
              '不正なアクションです、E,
          }
        );
      }
    );


    // ========================================================
    // 最後�E回筁E
    // ========================================================

    socket.on(
      'extra-poker:last-answer',
      async (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          extraPokerGames.get(
            roomId
          );

        if (
          !game
        ) {
          return;
        }

        if (
          game.phase !==
          'last-answer'
        ) {
          return;
        }

        if (
          game.currentActorId !==
          socket.id
        ) {
          return;
        }

        const answer =
          String(
            payload?.answer ??
              ''
          ).trim();

        if (
          !answer
        ) {
          socket.emit(
            'extra-poker:error',
            {
              message:
                'キャラクター名を入力してください、E,
            }
          );

          return;
        }

        const correct =
          extraPokerIsCorrectAnswer(
            game,
            answer
          );

        const player =
          extraPokerGetPlayers(
            game
          ).find(
            (item) =>
              item.socketId ===
              socket.id
          );

        for (
          const target of
            extraPokerGetPlayers(
              game
            )
        ) {
          const targetSocket =
            io.sockets.sockets.get(
              target.socketId
            );

          if (
            targetSocket
          ) {
            targetSocket.emit(
              'extra-poker:last-answer-result',
              {
                playerName:
                  player?.name ||
                  'プレイヤー',

                answer,

                correct,

                characterName:
                  correct
                    ? game.character.name
                    : null,

                description:
                  correct
                    ? String(
                        game.character?.description ?? ''
                      )
                    : null,
              }
            );
          }
        }

        if (
          correct
        ) {
          await extraPokerEndTurn(
            game,
            '最後�E回答で正解しました、E,
            [
              socket.id,
            ]
          );

          return;
        }

        await extraPokerEndTurn(
          game,
          '最後�E回答も不正解でした、E,
          []
        );
      }
    );


    // ========================================================
    // TURN NEXT
    // ========================================================

socket.on(
  'extra-poker:next-turn',
  async (payload) => {
    const roomId =
      String(
        payload?.roomId ||
          ''
      )
        .replace(
          /\D/g,
          ''
        )
        .slice(
          0,
          4
        );

    const game =
      extraPokerGames.get(
        roomId
      );

    const room =
      freeRooms.get(
        roomId
      );

    if (
      !game ||
      !room
    ) {
      return;
    }

    if (
      room.hostSocketId !==
      socket.id
    ) {
      socket.emit(
        'extra-poker:error',
        {
          message:
            '次のターンへ進めるのは部屋主です、E,
        }
      );

      return;
    }

    if (
      game.phase !==
      'turn-result'
    ) {
      return;
    }

    const players =
      extraPokerGetActivePlayers(
        game
      );

    if (
      players.length <= 1
    ) {
      extraPokerFinishGame(
        game
      );

      return;
    }

    /*
     * ========================================================
     * 次の「問題」�Eスタート�Eレイヤーを決める
     *
     * 同じ問題�E途中では変更しなぁE��E
     * turn-result ↁE次の問題、になった瞬間だぁE
     * 1人ずつスタート位置を進める、E
     * ========================================================
     */

    const currentStartId =
      game.turnStartPlayerId;

    const nextStartId =
      extraPokerNextPlayer(
        game,
        currentStartId
      );

    /*
     * ラウンド判宁E
     *
     * 2人なめE
     * 問顁E A
     * 問顁E B
     * で1ラウンド終亁E��E
     */
    const turnCount =
      game.turnNumber;

    const expectedTurns =
      Math.max(
        2,
        players.length
      );

    if (
      turnCount %
        expectedTurns ===
      0
    ) {
      game.round +=
        1;

      if (
        game.round >
        game.settings.rounds
      ) {
        extraPokerFinishGame(
          game
        );

        return;
      }
    }

    /*
     * 次の問題を開始、E
     *
     * ここでだぁEnextStartId を渡す、E
     */
    await extraPokerStartTurn(
      game,
      nextStartId
    );
  }
);

    // ========================================================
    // DISCONNECT
    // ========================================================

    socket.on(
      'disconnect',
      () => {
        for (
          const [
            roomId,
            game,
          ] of extraPokerGames
        ) {
          const room =
            freeRooms.get(
              roomId
            );

          if (!room) {
            extraPokerGames.delete(
              roomId
            );

            continue;
          }

          const stillPlayer =
            room.players instanceof Map
              ? Array.from(
                  room.players.values()
                ).some(
                  (player) =>
                    player.socketId ===
                    socket.id
                )
              : Array.isArray(
                  room.players
                )
                ? room.players.some(
                    (player) =>
                      player.socketId ===
                      socket.id
                  )
                : false;

          if (
            !stillPlayer
          ) {
            continue;
          }

          if (
            game.phase ===
            'setup'
          ) {
            extraPokerBroadcastState(
              game
            );

            continue;
          }

          extraPokerBroadcastState(
            game
          );
        }
      }
    );
  }
);


// ============================================================
// 看板たぬぁE
// ============================================================
//
// 既存�EHawk / Extra Poker等には触れなぁE��E
// 看板たぬき専用のSocket.IO処琁E��E
// ゲーム固有�E細かいチE�EタめE��示処琁E�Epage.js側へ刁E��する、E
// ============================================================

const saikoroGames =
  new Map();


// ============================================================
// 看板たぬき：基本設宁E
// ============================================================

const SAIKORO_MAX_PLAYERS =
  4;

const SAIKORO_WIN_COUNT =
  4;


// ============================================================
// 看板たぬき：�E期ダイス
// ============================================================

const SAIKORO_INITIAL_DICE_A = [
  {
    id:
      'berry1',
    type:
      'berry',
    value:
      1,
  },
  {
    id:
      'berry1',
    type:
      'berry',
    value:
      1,
  },
  {
    id:
      'berry1',
    type:
      'berry',
    value:
      1,
  },
  {
    id:
      'berry1',
    type:
      'berry',
    value:
      1,
  },
  {
    id:
      'berry1',
    type:
      'berry',
    value:
      1,
  },
  {
    id:
      'verse1',
    type:
      'verse',
    value:
      1,
  },
];


const SAIKORO_INITIAL_DICE_B = [
  {
    id:
      'berry1',
    type:
      'berry',
    value:
      1,
  },
  {
    id:
      'berry1',
    type:
      'berry',
    value:
      1,
  },
  {
    id:
      'berry1',
    type:
      'berry',
    value:
      1,
  },
  {
    id:
      'berry1',
    type:
      'berry',
    value:
      1,
  },
  {
    id:
      'berry1',
    type:
      'berry',
    value:
      1,
  },
  {
    id:
      'eternal1',
    type:
      'eternal',
    value:
      1,
  },
];


// ============================================================
// 看板たぬき：�E期賁E��上限
// ============================================================

const SAIKORO_INITIAL_MAX_RESOURCES = {
  berry:
    12,

  verse:
    6,

  eternal:
    6,
};


// ============================================================
// 看板たぬき：�E期�Eリー
// ============================================================

function saikoroInitialBerry(
  playerNumber
) {
  const number =
    Number(
      playerNumber
    );

  if (
    number === 1
  ) {
    return 3;
  }

  if (
    number === 2
  ) {
    return 2;
  }

  if (
    number === 3
  ) {
    return 1;
  }

  return 0;
}


// ============================================================
// 看板たぬき：シャチE��ル
// ============================================================

function saikoroShuffle(
  array
) {
  const result =
    [
      ...array,
    ];

  for (
    let i =
      result.length - 1;
    i > 0;
    i -= 1
  ) {
    const j =
      Math.floor(
        Math.random() *
          (i + 1)
      );

    [
      result[i],
      result[j],
    ] = [
      result[j],
      result[i],
    ];
  }

  return result;
}


// ============================================================
// 看板たぬき：部屋�Eレイヤー取征E
// ============================================================

function saikoroGetPlayers(
  game
) {
  const room =
    freeRooms.get(
      game.roomId
    );

  if (
    !room
  ) {
    return [];
  }

  if (
    room.players instanceof
    Map
  ) {
    return Array.from(
      room.players.values()
    );
  }

  if (
    Array.isArray(
      room.players
    )
  ) {
    return room.players;
  }

  return [];
}


// ============================================================
// 看板たぬき：ゲームプレイヤー惁E��取征E
// ============================================================

function saikoroGetGamePlayer(
  game,
  socketId
) {
  if (
    !game ||
    !socketId
  ) {
    return null;
  }

  return (
    game.players?.[
      socketId
    ] ||
    null
  );
}


// ============================================================
// 看板たぬき：賁E��を上限冁E��加箁E
// ============================================================

function saikoroAddResource(
  player,
  type,
  amount
) {
  if (
    !player ||
    !player.resources ||
    !player.maxResources
  ) {
    return 0;
  }

  if (
    ![
      'berry',
      'verse',
      'eternal',
    ].includes(
      type
    )
  ) {
    return 0;
  }

  const add =
    Math.max(
      0,
      Number(amount) || 0
    );

  const before =
    Number(
      player.resources[
        type
      ] ?? 0
    );

  const max =
    Number(
      player.maxResources[
        type
      ] ?? 0
    );

  const after =
    Math.min(
      max,
      before + add
    );

  player.resources[
    type
  ] = after;

  return (
    after -
    before
  );
}


// ============================================================
// 看板たぬき：ダイス1個を振めE
// ============================================================

function saikoroRollOneDie(
  faces
) {
  if (
    !Array.isArray(
      faces
    ) ||
    faces.length === 0
  ) {
    return null;
  }

  const index =
    Math.floor(
      Math.random() *
        faces.length
    );

  const face =
    faces[index];

  return {
    index,

    face: {
      ...face,
    },
  };
}


// ============================================================
// 看板たぬき！E人刁E�Eダイスを振めE
// ============================================================

function saikoroRollPlayerDice(
  player
) {
  const result = {
    a:
      saikoroRollOneDie(
        player.diceA
      ),

    b:
      saikoroRollOneDie(
        player.diceB
      ),
  };

  return result;
}


// ============================================================
// 看板たぬき：ダイス結果から賁E��を獲征E
// ============================================================

function saikoroApplyDiceResult(
  player,
  result
) {
  if (
    !player ||
    !result
  ) {
    return;
  }

  const results = [
    result.a,
    result.b,
  ];

  for (
    const item of results
  ) {
    if (
      !item?.face
    ) {
      continue;
    }

    const type =
      item.face.type;

    const value =
      Number(
        item.face.value
      ) || 0;

    if (
      type ===
      'berry'
    ) {
      saikoroAddResource(
        player,
        'berry',
        value
      );
    }

    if (
      type ===
      'verse'
    ) {
      saikoroAddResource(
        player,
        'verse',
        value
      );
    }

    if (
      type ===
      'eternal'
    ) {
      saikoroAddResource(
        player,
        'eternal',
        value
      );
    }
  }
}


// ============================================================
// 看板たぬき：�E開用プレイヤー惁E��
// ============================================================

function saikoroPublicPlayer(game, player, index) {
if (!player) {
return null;
}

const gamePlayer = game.players?.[player.socketId];

const seat = Number.isInteger(gamePlayer?.seat)
? gamePlayer.seat
: index;

if (!gamePlayer) {
return {
seat,
id: player.userId ?? null,
name: player.name || `プレイヤー${seat + 1}`,
resources: {
berry: 0,
verse: 0,
eternal: 0,
},
maxResources: {
...SAIKORO_INITIAL_MAX_RESOURCES,
},
diceA: SAIKORO_INITIAL_DICE_A.map((face) => ({ ...face })),
diceB: SAIKORO_INITIAL_DICE_B.map((face) => ({ ...face })),
cards: [],
extraCharacterInfo: [],
vivreCardInfo: [],
extraCharacterCount: 0,
vivreCardCount: 0,
};
}

return {
seat,
id: player.userId ?? null,
name: player.name || `プレイヤー${seat + 1}`,
resources: {
berry: Number(gamePlayer.resources?.berry ?? 0),
verse: Number(gamePlayer.resources?.verse ?? 0),
eternal: Number(gamePlayer.resources?.eternal ?? 0),
},
maxResources: {
...gamePlayer.maxResources,
},
diceA: gamePlayer.diceA.map((face) => ({ ...face })),
diceB: gamePlayer.diceB.map((face) => ({ ...face })),
cards: gamePlayer.cards.map((card) => ({ ...card })),
extraCharacterInfo: [...gamePlayer.extraCharacterInfo],
vivreCardInfo: [...gamePlayer.vivreCardInfo],
extraCharacterCount: Number(gamePlayer.extraCharacterCount ?? 0),
vivreCardCount: Number(gamePlayer.vivreCardCount ?? 0),
};
}


// ============================================================
// 看板たぬき：現在の状態を作る
// ============================================================

function saikoroBuildState(
  game
) {
  const players =
    saikoroGetPlayers(
      game
    );

  return {
    roomId:
      game.roomId,

    phase:
      game.phase,

    turnPlayer:
      Number(
        game.turnPlayer ??
          0
      ),

    round:
      Number(
        game.round ??
          1
      ),


players:
  players.map(
    (player, index) =>
      saikoroPublicPlayer(
        game,
        player,
        index
      )
  ),



    diceResults:
      game.diceResults || {},

    actionUsed:
      game.actionUsed || {},

    extraActionUsed:
      game.extraActionUsed ||
      {},

    answerTarget:
      game.answerTarget ||
      null,

    message:
      game.message ||
      '',
  };
}


// ============================================================
// 看板たぬき：状態を全員へ送信
// ============================================================

function saikoroBroadcastState(
  game
) {
  const players =
    saikoroGetPlayers(
      game
    );

  if (
    !players.length
  ) {
    return;
  }

  const state =
    saikoroBuildState(
      game
    );

  for (
    const player of players
  ) {
    const targetSocket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (
      !targetSocket
    ) {
      continue;
    }

    targetSocket.emit(
      'saikoro:state',
      state
    );
  }
}


// ============================================================
// 看板たぬき：エラー送信
// ============================================================

function saikoroError(
  socket,
  message
) {
  if (
    !socket
  ) {
    return;
  }

  socket.emit(
    'saikoro:error',
    {
      message,
    }
  );
}


// ============================================================
// 看板たぬき：ゲーム開姁E
// ============================================================


function saikoroStartGame(game) {
  const room = freeRooms.get(game.roomId);

  if (!room) {
    return false;
  }

  const players = saikoroGetPlayers(game);

  if (players.length !== SAIKORO_MAX_PLAYERS) {
    game.message = `4人揁E��までお征E��ください。現在 ${players.length}/${SAIKORO_MAX_PLAYERS}人`;
    saikoroBroadcastState(game);
    return false;
  }

  game.phase = 'dice';
  game.round = 1;
  game.turnPlayer = 0;
  game.diceResults = {};
  game.actionUsed = {};
  game.extraActionUsed = {};
  game.answerTarget = null;
  game.message = '全員でダイスを振ってください、E;

  game.players = {};

  for (let index = 0; index < players.length; index += 1) {
    const player = players[index];
    const seat = index;

    game.players[player.socketId] = {
      socketId: player.socketId,
      userId: player.userId ?? null,
      name: player.name || `プレイヤー${seat + 1}`,
      seat,

      resources: {
        berry: saikoroInitialBerry(seat + 1),
        verse: 0,
        eternal: 0,
      },

      maxResources: {
        ...SAIKORO_INITIAL_MAX_RESOURCES,
      },

      diceA: SAIKORO_INITIAL_DICE_A.map((face) => ({
        ...face,
      })),

      diceB: SAIKORO_INITIAL_DICE_B.map((face) => ({
        ...face,
      })),

      cards: [],
      extraCharacterInfo: [],
      vivreCardInfo: [],
      extraCharacterCount: 0,
      vivreCardCount: 0,
    };
  }

  saikoroBroadcastState(game);

  console.log(
    `[saikoro] game started room=${game.roomId}`
  );

  return true;
}


// ============================================================
// 看板たぬき：�E員同時ダイス
// ============================================================

function saikoroRollAllPlayers(
  game
) {
  const players =
    saikoroGetPlayers(
      game
    );

  game.diceResults =
    {};

  for (
    const player of players
  ) {
    const gamePlayer =
      saikoroGetGamePlayer(
        game,
        player.socketId
      );

    if (
      !gamePlayer
    ) {
      continue;
    }

    const result =
      saikoroRollPlayerDice(
        gamePlayer
      );

    game.diceResults[
      player.socketId
    ] = result;

    saikoroApplyDiceResult(
      gamePlayer,
      result
    );
  }

  game.phase =
    'action';

  game.actionUsed =
    {};

  game.extraActionUsed =
    {};

  game.answerTarget =
    null;

  game.message =
    `プレイヤー${
      Number(
        game.turnPlayer
      ) + 1
    }のアクションです。`;

  saikoroBroadcastState(
    game
  );
}


// ============================================================
// 看板たぬき：次のターン
// ============================================================

function saikoroNextTurn(
  game
) {
  const players =
    saikoroGetPlayers(
      game
    );

  if (
    players.length ===
    0
  ) {
    return;
  }

  const currentIndex =
    Number(
      game.turnPlayer ??
        0
    );

  let nextIndex =
    currentIndex + 1;

  if (
    nextIndex >=
    SAIKORO_MAX_PLAYERS
  ) {
    nextIndex =
      0;

    game.round =
      Number(
        game.round ??
          1
      ) + 1;
  }

  game.turnPlayer =
    nextIndex;

  game.phase =
    'dice';

  game.diceResults =
    {};

  game.actionUsed =
    {};

  game.extraActionUsed =
    {};

  game.answerTarget =
    null;

  game.message =
    `プレイヤー${
      nextIndex + 1
    }のダイスフェーズです。�E員でダイスを振ります。`;

  saikoroBroadcastState(
    game
  );
}


// ============================================================
// 看板たぬき：Socket.IO
// ============================================================

io.on(
  'connection',
  (socket) => {

    // ========================================================
    // 部屋へ参加
    // ========================================================

    socket.on(
      'saikoro:join',
      (payload) => {
        const safeRoomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        if (
          safeRoomId.length !==
          4
        ) {
          saikoroError(
            socket,
            '部屋IDが正しくありません、E
          );

          return;
        }

        const room =
          freeRooms.get(
            safeRoomId
          );

        if (
          !room
        ) {
          saikoroError(
            socket,
            'フリーマッチE��屋が見つかりません、E
          );

          return;
        }

        const incomingUserId =
          payload?.userId != null
            ? String(
                payload.userId
              )
            : '';

        const incomingName =
          String(
            payload?.name ||
              ''
          ).trim();

        const freePlayers =
          room.players instanceof
          Map
            ? Array.from(
                room.players.values()
              )
            : Array.isArray(
                room.players
              )
              ? room.players
              : [];

        let playerIndex =
          freePlayers.findIndex(
            (item) =>
              item.socketId ===
              socket.id
          );

        if (
          playerIndex < 0 &&
          incomingUserId
        ) {
          playerIndex =
            freePlayers.findIndex(
              (item) =>
                item.userId !=
                  null &&
                String(
                  item.userId
                ) ===
                  incomingUserId
            );
        }

        if (
          playerIndex < 0 &&
          incomingName
        ) {
          const sameName =
            freePlayers.filter(
              (item) =>
                String(
                  item.name ||
                    ''
                ).trim() ===
                incomingName
            );

          if (
            sameName.length ===
            1
          ) {
            playerIndex =
              freePlayers.findIndex(
                (item) =>
                  String(
                    item.name ||
                      ''
                  ).trim() ===
                  incomingName
              );
          }
        }

        if (
          playerIndex < 0
        ) {
          saikoroError(
            socket,
            'こ�E部屋�E参加老E��はありません、E
          );

          return;
        }

        const player =
          freePlayers[
            playerIndex
          ];

        const oldSocketId =
          player.socketId;

        /*
         * 看板たぬき�E4人専用、E
         */
        if (
          playerIndex >=
          SAIKORO_MAX_PLAYERS
        ) {
          saikoroError(
            socket,
            '看板たぬき�E4人専用です、E
          );

          return;
        }

        /*
         * 古いSocketがあれ�E刁E��離す、E
         */
        if (
          oldSocketId &&
          oldSocketId !==
            socket.id
        ) {
          const oldSocket =
            io.sockets.sockets.get(
              oldSocketId
            );

          if (
            oldSocket
          ) {
            oldSocket.leave(
              `free:${safeRoomId}`
            );
          }
        }

        /*
         * Socket IDを更新、E
         */
        player.socketId =
          socket.id;

        /*
         * ゲーム取得、E
         */
        let game =
          saikoroGames.get(
            safeRoomId
          );

        if (
          !game
        ) {
          game = {
            roomId:
              safeRoomId,

            phase:
              'waiting',

            round:
              0,

            turnPlayer:
              0,

            players:
              {},

            diceResults:
              {},

            actionUsed:
              {},

            extraActionUsed:
              {},

            answerTarget:
              null,

            message:
              '4人揁E��までお征E��ください、E,
          };

          saikoroGames.set(
            safeRoomId,
            game
          );
        }

        /*
         * 再接続時にゲーム冁E��ータめE
         * 新しいSocketへ移す、E
         */
        if (
          oldSocketId &&
          oldSocketId !==
            socket.id &&
          game.players[
            oldSocketId
          ]
        ) {
          game.players[
            socket.id
          ] =
            game.players[
              oldSocketId
            ];

          game.players[
            socket.id
          ].socketId =
            socket.id;

          delete game.players[
            oldSocketId
          ];

          if (
            game.diceResults[
              oldSocketId
            ]
          ) {
            game.diceResults[
              socket.id
            ] =
              game.diceResults[
                oldSocketId
              ];

            delete game.diceResults[
              oldSocketId
            ];
          }
        }

        /*
         * ゲーム開始済みで新規参加は不可、E
         */
        if (
          game.phase !==
            'waiting' &&
          !game.players[
            socket.id
          ]
        ) {
          saikoroError(
            socket,
            'こ�Eゲームはすでに開始されてぁE��す、E
          );

          return;
        }

        socket.join(
          `free:${safeRoomId}`
        );

        console.log(
          `[saikoro] join room=${safeRoomId} socket=${socket.id} name=${player.name}`
        );

        /*
         * 4人揁E��てぁE��ければ
         * プレイヤー惁E��だけ作�E、E
         */
        if (
          game.phase ===
          'waiting'
        ) {
          const currentPlayers =
            saikoroGetPlayers(
              game
            );

          if (
            currentPlayers.length <
            SAIKORO_MAX_PLAYERS
          ) {
            game.message =
              `4人揁E��までお征E��ください。現在 ${currentPlayers.length}/${SAIKORO_MAX_PLAYERS}人`;
          }
        }

        saikoroBroadcastState(
          game
        );
      }
    );


    // ========================================================
    // ダイスを振めE
    // ========================================================

    socket.on(
      'saikoro:roll',
      (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          saikoroGames.get(
            roomId
          );

        if (
          !game
        ) {
          saikoroError(
            socket,
            '看板たぬき�Eゲームが見つかりません、E
          );

          return;
        }

        if (
          game.phase !==
          'dice'
        ) {
          saikoroError(
            socket,
            '現在はダイスを振るフェーズではありません、E
          );

          return;
        }

        saikoroRollAllPlayers(
          game
        );
      }
    );


    // ========================================================
    // ダイス面購入
    // ========================================================

    socket.on(
      'saikoro:buy-dice-face',
      (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          saikoroGames.get(
            roomId
          );

        if (
          !game
        ) {
          saikoroError(
            socket,
            '看板たぬき�Eゲームが見つかりません、E
          );

          return;
        }

        const gamePlayer =
          saikoroGetGamePlayer(
            game,
            socket.id
          );

        if (
          !gamePlayer
        ) {
          return;
        }

        if (
          gamePlayer.seat !==
          Number(
            game.turnPlayer
          )
        ) {
          saikoroError(
            socket,
            '自刁E�Eターンではありません、E
          );

          return;
        }

        if (
          game.phase !==
          'action'
        ) {
          saikoroError(
            socket,
            '現在はアクションフェーズではありません、E
          );

          return;
        }

        if (
          game.actionUsed[
            socket.id
          ]
        ) {
          saikoroError(
            socket,
            'こ�Eターンのアクションはすでに使用してぁE��す、E
          );

          return;
        }

        /*
         * 実際のダイス面惁E��・価格・
         * ランダム処琁E�E今後別ファイルへ移す、E
         *
         * 現段階ではfaceIdを受け取って
         * page.js側と通信できる土台だけ作る、E
         */
        const faceId =
          String(
            payload?.faceId ||
              ''
          );

        const die =
          payload?.die ===
          'B'
            ? 'B'
            : 'A';

        const faceIndex =
          Number(
            payload?.faceIndex
          );

        if (
          !faceId
        ) {
          saikoroError(
            socket,
            'ダイスフェイスが指定されてぁE��せん、E
          );

          return;
        }

        if (
          !Number.isInteger(
            faceIndex
          ) ||
          faceIndex < 0 ||
          faceIndex > 5
        ) {
          saikoroError(
            socket,
            '交換するダイス面が正しくありません、E
          );

          return;
        }

        /*
         * ここではまだ購入価格の確定�E琁E��
         * 実裁E��なぁE��E
         *
         * ダイス面ショチE�Eの正式仕様を
         * page.js側のモジュールと合わせて
         * 次の段階で実裁E��る、E
         */
        game.actionUsed[
          socket.id
        ] = true;

        game.message =
          `プレイヤー${
            gamePlayer.seat + 1
          }がダイスフェイスを選択しました。`;

        saikoroBroadcastState(
          game
        );
      }
    );


    // ========================================================
    // カード購入
    // ========================================================

    socket.on(
      'saikoro:buy-card',
      (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          saikoroGames.get(
            roomId
          );

        if (
          !game
        ) {
          saikoroError(
            socket,
            '看板たぬき�Eゲームが見つかりません、E
          );

          return;
        }

        const gamePlayer =
          saikoroGetGamePlayer(
            game,
            socket.id
          );

        if (
          !gamePlayer
        ) {
          return;
        }

        if (
          gamePlayer.seat !==
          Number(
            game.turnPlayer
          )
        ) {
          saikoroError(
            socket,
            '自刁E�Eターンではありません、E
          );

          return;
        }

        if (
          game.phase !==
          'action'
        ) {
          saikoroError(
            socket,
            '現在はアクションフェーズではありません、E
          );

          return;
        }

        if (
          game.actionUsed[
            socket.id
          ]
        ) {
          saikoroError(
            socket,
            'こ�Eターンのアクションはすでに使用してぁE��す、E
          );

          return;
        }

        const cardId =
          String(
            payload?.cardId ||
              ''
          );

        if (
          !cardId
        ) {
          saikoroError(
            socket,
            'カードが持E��されてぁE��せん、E
          );

          return;
        }

        /*
         * カード価格・効果�E残り枚数は
         * 今後カード専用モジュールで処琁E��る、E
         */
        game.actionUsed[
          socket.id
        ] = true;

        game.message =
          `プレイヤー${
            gamePlayer.seat + 1
          }がカードを選択しました。`;

        saikoroBroadcastState(
          game
        );
      }
    );


    // ========================================================
    // 追加アクション
    // ========================================================

    socket.on(
      'saikoro:extra-action',
      (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          saikoroGames.get(
            roomId
          );

        if (
          !game
        ) {
          return;
        }

        const gamePlayer =
          saikoroGetGamePlayer(
            game,
            socket.id
          );

        if (
          !gamePlayer
        ) {
          return;
        }

        if (
          gamePlayer.seat !==
          Number(
            game.turnPlayer
          )
        ) {
          saikoroError(
            socket,
            '自刁E�Eターンではありません、E
          );

          return;
        }

        if (
          game.phase !==
          'action'
        ) {
          saikoroError(
            socket,
            '現在はアクションフェーズではありません、E
          );

          return;
        }

        if (
          game.extraActionUsed[
            socket.id
          ]
        ) {
          saikoroError(
            socket,
            '追加アクションはすでに使用してぁE��す、E
          );

          return;
        }

        /*
         * ヴァース2を消費、E
         */
        if (
          Number(
            gamePlayer.resources
              ?.verse ?? 0
          ) < 2
        ) {
          saikoroError(
            socket,
            '追加アクションにはヴァースぁE個忁E��です、E
          );

          return;
        }

        gamePlayer.resources.verse -=
          2;

        game.extraActionUsed[
          socket.id
        ] = true;

        game.actionUsed[
          socket.id
        ] = false;

        game.message =
          `プレイヤー${
            gamePlayer.seat + 1
          }が追加アクションを使用しました。`;

        saikoroBroadcastState(
          game
        );
      }
    );


    // ========================================================
    // 購入終亁EↁE回答フェーズ
    // ========================================================

    socket.on(
      'saikoro:finish-action',
      (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          saikoroGames.get(
            roomId
          );

        if (
          !game
        ) {
          return;
        }

        const gamePlayer =
          saikoroGetGamePlayer(
            game,
            socket.id
          );

        if (
          !gamePlayer
        ) {
          return;
        }

        if (
          gamePlayer.seat !==
          Number(
            game.turnPlayer
          )
        ) {
          saikoroError(
            socket,
            '自刁E�Eターンではありません、E
          );

          return;
        }

        if (
          game.phase !==
          'action'
        ) {
          saikoroError(
            socket,
            '現在はアクションフェーズではありません、E
          );

          return;
        }

        game.phase =
          'answer';

        game.answerTarget =
          null;

        game.message =
          `プレイヤー${
            gamePlayer.seat + 1
          }の回答フェーズです。`;

        saikoroBroadcastState(
          game
        );
      }
    );


    // ========================================================
    // 回筁E
    // ========================================================

    socket.on(
      'saikoro:answer',
      (payload) => {
        const roomId =
          String(
            payload?.roomId ||
              ''
          )
            .replace(
              /\D/g,
              ''
            )
            .slice(
              0,
              4
            );

        const game =
          saikoroGames.get(
            roomId
          );

        if (
          !game
        ) {
          return;
        }

        const gamePlayer =
          saikoroGetGamePlayer(
            game,
            socket.id
          );

        if (
          !gamePlayer
        ) {
          return;
        }

        if (
          gamePlayer.seat !==
          Number(
            game.turnPlayer
          )
        ) {
          saikoroError(
            socket,
            '自刁E�Eターンではありません、E
          );

          return;
        }

        if (
          game.phase !==
          'answer'
        ) {
          saikoroError(
            socket,
            '現在は回答フェーズではありません、E
          );

          return;
        }

        const target =
          payload?.target ===
          'vivre'
            ? 'vivre'
            : 'extra';

        const answer =
          String(
            payload?.answer ||
              ''
          ).trim();

        /*
         * 正式な回答判定�E
         * extra-character / vivre-search
         * の既存�E琁E��参老E��
         * 専用モジュールへ移す、E
         *
         * 現段階では回答値を保存して
         * 次の実裁E��つなげる、E
         */
        game.answerTarget = {
          socketId:
            socket.id,

          target,

          answer,
        };

        game.message =
          `プレイヤー${
            gamePlayer.seat + 1
          }が回答しました。`;

        saikoroBroadcastState(
          game
        );
      }
    );


    // ========================================================
    // 刁E��
    // ========================================================

    socket.on(
      'disconnect',
      () => {
        const game =
          Array.from(
            saikoroGames.values()
          ).find(
            (item) =>
              item.players?.[
                socket.id
              ]
          );

        if (
          !game
        ) {
          return;
        }

        /*
         * ゲーム中はゲームチE�Eタを消さなぁE��E
         * 再接続時にuserId/nameから
         * 新しいSocketへ移せるようにする、E
         */
        console.log(
          `[saikoro] disconnect room=${game.roomId} socket=${socket.id}`
        );
      }
    );
  }
);
