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

// ヘルスチェック
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
// 共通
// ------------------------------

function log(...args) {
  console.log("[server]", ...args);
}

// レートから称号
function getRankName(rating) {
  if (rating >= 1800) return "海賊王";
  if (rating >= 1750) return "四皇";
  if (rating >= 1700) return "七武海";
  if (rating >= 1650) return "超新星";
  if (rating >= 1600) return "Level 新世界";
  if (rating >= 1550) return "Level 偉大なる航路";
  if (rating >= 1500) return "Level 東の海";
  return "海賊見習い";
}

// ========== レートマッチ用キュー ==========
const rateQueue = [];

// ========== 通常バトル用ルーム状態 ==========
const rooms = new Map();

// ======================================================
// ★ フリーマッチ用ルーム
// ======================================================
//
// roomId:
//   4桁の数字
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
// フリーマッチ部屋ID生成
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
// フリーマッチ部屋の状態を作る
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
// フリーマッチ部屋全員へ状態送信
// ------------------------------

function broadcastFreeRoom(room) {
  if (!room) return;

  const payload = makeFreeRoomPayload(room);

  for (const player of room.players.values()) {
    io.to(player.socketId).emit("free:room-state", payload);
  }
}

// ------------------------------
// フリーマッチ部屋から削除
// ------------------------------

function removeSocketFromFreeRooms(socketId) {
  for (const [roomId, room] of freeRooms.entries()) {
    if (!room.players.has(socketId)) {
      continue;
    }

    const leavingPlayer =
      room.players.get(socketId);

    // ★ Hawkなどゲーム画面へ移動するための
    // Socket切り替え中なら、プレイヤー情報を残す
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
// DB ヘルパー
// ======================================================

// id でユーザー取得
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

// username / display_name でユーザー取得
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

// user_id からマイチーム
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

// ユーザー取得ヘルパー
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
// レート計算
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
// 通常終了レート更新
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
// 切断敗北
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
      "レート戦勝利報酬(切断)"
    );
  } catch (e) {
    log(
      "addBerriesByUserId error:",
      e
    );
  }
}

// ======================================================
// レートマッチング
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
  // レートマッチ
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
  // ★ フリーマッチ
  // ====================================================

  // --------------------------------
  // 部屋を作る
  // --------------------------------

  socket.on(
    "free:create",
    ({ name, userId }) => {
      // 既存のフリーマッチ部屋から抜ける
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
              "部屋を作成できませんでした。もう一度お試しください。",
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
  // 部屋を探す
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
              "部屋IDは4桁の数字で入力してください。",
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
              "その部屋は見つかりませんでした。",
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
              "この部屋は満員です。",
          }
        );

        return;
      }

      // すでに同じ部屋にいる場合
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

      // 他の部屋にいた場合は抜ける
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
  // ゲーム選択
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
              "部屋が見つかりません。",
          }
        );

        return;
      }

      // 部屋主だけゲームを選べる
      if (
        room.hostSocketId !==
        socket.id
      ) {
        socket.emit(
          "free:error",
          {
            message:
              "ゲームを選択できるのは部屋主です。",
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
  // ゲーム開始
  //
  // 今はゲーム本体未実装なので
  // 選択状態だけ保持する。
  // 後で各ゲームの開始処理を追加。
  // --------------------------------

  socket.on(
    "free:start-game",
    ({ roomId }) => {
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
              "部屋が見つかりません。",
          }
        );

        return;
      }

      if (
        room.hostSocketId !==
        socket.id
      ) {
        socket.emit(
          "free:error",
          {
            message:
              "ゲームを開始できるのは部屋主です。",
          }
        );

        return;
      }

      if (!room.selectedGame) {
        socket.emit(
          "free:error",
          {
            message:
              "ゲームを選択してください。",
          }
        );

        return;
      }

      // 現段階ではここまで。
      // 後で gameId ごとに実際のゲームへ移動する。
      io.to(
        `free:${safeRoomId}`
      ).emit(
        "free:game-start",
        {
          roomId:
            safeRoomId,
          gameId:
            room.selectedGame,
        }
      );
    }
  );

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
  // 切断
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

      // ★ フリーマッチ部屋から削除
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
});

// ======================================================
// 起動
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
// ハゲタカのえじき
// ============================================================
//
// 既存の rate / free 処理には手を入れない。
// このブロックを server.js の一番下に追加するだけ。
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
        'popularity.xlsx にシートがありません。'
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
        `popularity.xlsx から15人以上のキャラクターを読み込めませんでした。読み込み数: ${characters.length}`
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
// Excelデータのキャッシュ
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
// Fisher-Yatesシャッフル
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
// 人気順位から15キャラを選ぶ
// ============================================================
//
// スタート順位は完全ランダム。
// 例えば間隔10なら
//
// 45 → 55 → 65 → ... → 185
//
// のように15人を選ぶ。
// 実際の順位に存在しない場合は一番近い順位を使用。
// 同距離ならランダム。
// 最後にカード表示順もシャッフル。
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
// 部屋状態を各プレイヤーへ送信
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
// 自分の手札を送る
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
// 全員へ自分の手札を送る
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
// ラウンド開始
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
// ゲーム開始
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
   * 各カードにゲーム内専用IDを付ける。
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
      `キャラクターカードを15枚作成できませんでした。作成数: ${selected.length}`
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
   * 全員同じ15枚を持つ。
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
   * 得点カードをシャッフル。
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
   * ゲーム中は名前だけ。
   * rankは絶対に送らない。
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
   * 1枚目の得点カードを開始。
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
// ラウンド判定
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
   * 同じ人気順位を出した人は全員無効。
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
     * プラス・0：
     * 人気順位の数字が小さい方が強い。
     *
     * マイナス：
     * 人気順位の数字が大きい方が強い。
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
   * 全員バッティング。
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
          '全員のカードが無効になったため、この得点カードは誰も獲得しません。',

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
        '全員のカードが無効になりました。得点カードは次のラウンドへ持ち越されます。',

      playedCards:
        publicPlayedCards,

      finished:
        false,
    };
  }

  /*
   * 勝者が得点カードを獲得。
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
   * キャリーオーバーを空にする。
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
// 最終結果を作成
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
            `第${item.round}回戦：${played.playerName}`
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
// ゲーム終了
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
                '部屋IDが正しくありません。',
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
                'フリーマッチ部屋が見つかりません。',
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
         * userIdで探す。
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
         * 名前で探す。
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
                'この部屋の参加者ではありません。',
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
         * ホスト判定。
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
         * 古いSocketを部屋から離す。
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
         * Socket IDを更新。
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
         * 全員のホスト状態を更新。
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
         * ゲーム開始後の再接続なら
         * 古いSocketのデータを新しいSocketへ移す。
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
         * ゲーム開始後に新しく入ってきた場合は
         * 現在のゲームへ参加させない。
         *
         * 再接続で手札が移されていれば許可。
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
                'このゲームはすでに開始されています。',
            }
          );

          return;
        }

        /*
         * スコア初期化。
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
         * ゲーム中なら自分の手札を復元。
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
         * ゲーム終了後なら最終結果も送る。
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
    // ゲーム設定開始
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
                'ゲーム部屋が見つかりません。',
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
                'ゲーム設定を変更できるのは部屋主だけです。',
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
    // ゲーム開始
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
                'ゲーム部屋が見つかりません。',
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
                'ゲームを開始できるのは部屋主です。',
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
                'ハゲタカのえじきは2人以上必要です。',
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
                'ハゲタカのえじきは4人までです。',
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
                '指定間隔は1以上の整数にしてください。',
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
                'ゲーム開始時にエラーが発生しました。',
            }
          );
        }
      }
    );


    // ========================================================
    // カードを出す
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
                'ゲーム部屋が見つかりません。',
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
                '現在カードを出せる状態ではありません。',
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
                'ゲーム参加者ではありません。',
            }
          );

          return;
        }

        const playerSocketId =
          player.socketId;

        /*
         * 既に出している場合は無視。
         */
        if (
          game.played[
            playerSocketId
          ]
        ) {
          socket.emit(
            'hawk:error',
            {
              message:
                'このラウンドでは既にカードを出しています。',
            }
          );

          return;
        }

        /*
         * プレイヤー本人のSocket IDで手札を取得。
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
                '手札が見つかりません。',
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
                'そのカードは現在の手札にありません。',
            }
          );

          return;
        }

        /*
         * 手札から削除。
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
         * 場に出したカードを記録。
         */
        game.played[
          playerSocketId
        ] =
          cardId;

        /*
         * 自分の残り手札を更新。
         */
        hawkSendMyCards(
          game,
          socket
        );

        /*
         * 全員出したか確認。
         */
        const players =
          hawkGetPlayers(
            game
          );

        const allSubmitted =
          players.every(
            (player) =>
              Boolean(
                game.played[
                  player.socketId
                ]
              )
          );

        if (
          !allSubmitted
        ) {
          return;
        }

        /*
         * 全員公開。
         */
        const result =
          hawkResolveRound(
            game
          );

        /*
         * 履歴を保存。
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
         * ラウンド結果を全員へ。
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
         * 15回戦終了。
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
    // 次のラウンド
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
                'ゲーム部屋が見つかりません。',
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
                '次のラウンドを開始できるのは部屋主です。',
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
                '現在は次のラウンドへ進めません。',
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
    // 切断
    // ========================================================

    socket.on(
      'disconnect',
      () => {

        /*
         * Hawkゲームを確認。
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
           * まだゲーム開始前なら
           * free room側の処理に任せる。
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
           * ゲーム中に切断した場合。
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
           * 残ったプレイヤーが2人未満なら終了。
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
                      'プレイヤーが退出したため、ゲームを終了しました。',
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
           * 既に全員出していた場合は
           * 残ったメンバーだけで判定。
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