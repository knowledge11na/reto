// file: tcgMode.js
// ONE PIECE TCG（仮）のオンライン対戦サーバー処理
// server.js から setupTcgMode(io) を呼ぶ
import {
  CARD_DEFS,
  ACTIVE_CARDS,
  MUGICHA_GENRES,
  COST_FIRST,
  COST_SECOND,
  INITIAL_LIFE,
  LIFE_HP,
  INITIAL_HAND,
  BOARD_SIZE,
  QUIZ_MS,
  STANDARD_DECK,
  normalizeDeck,
} from './lib/tcgCards.js';
import { makeQuestion, ALL_GENRES } from './lib/tcgQuestions.js';

const games = new Map();
let IO = null;

class GameError extends Error {}

const fail = (msg) => {
  throw new GameError(msg);
};

const rnd = (n) => Math.floor(Math.random() * n);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ===== ゲーム生成 =====
function createGame(roomId) {
  return {
    roomId,
    seats: [null, null],
    players: [],
    phase: 'waiting', // waiting | playing | finished
    current: 0,
    first: 0,
    pending: null,
    combat: null,
    timer: null,
    log: [],
    seq: 0,
    winner: null,
    flash: null,
    flashSeq: 0,
    cleanup: null,
  };
}

function newId(game) {
  game.seq += 1;
  return game.seq;
}

function addLog(game, text) {
  game.log.push(text);
  if (game.log.length > 60) game.log.shift();
}

function createPlayerState(game, deckSpec) {
  const cards = [];
  for (const [defId, n] of Object.entries(deckSpec || STANDARD_DECK)) {
    for (let i = 0; i < n; i++) cards.push({ id: newId(game), defId });
  }
  const deck = shuffle(cards);
  return {
    life: INITIAL_LIFE,
    lifeHp: LIFE_HP,
    deck: deck.slice(INITIAL_HAND),
    hand: deck.slice(0, INITIAL_HAND),
    board: [],
    trash: [],
    turns: 0,
    cost: 0,
  };
}

function startGame(game) {
  game.players = game.seats.map((s) => createPlayerState(game, s.deck));
  game.first = rnd(2);
  game.phase = 'playing';
  game.winner = null;
  addLog(game, `対戦開始！ 先攻は ${game.seats[game.first].name} です。`);
  startTurn(game, game.first);
}

// ===== 基本操作 =====
const power = (c) => CARD_DEFS[c.defId].power + c.bonus + c.turnTemp + c.temp;

function findChar(game, id) {
  for (let pi = 0; pi < 2; pi++) {
    const c = game.players[pi].board.find((x) => x.id === id);
    if (c) return { pi, c };
  }
  return null;
}

function draw(game, pi, n) {
  const P = game.players[pi];
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (!P.deck.length) break;
    P.hand.push(P.deck.shift());
    drawn += 1;
  }
  return drawn;
}

function startTurn(game, pi) {
  const P = game.players[pi];
  P.turns += 1;
  const schedule = pi === game.first ? COST_FIRST : COST_SECOND;
  P.maxCost = schedule[Math.min(P.turns - 1, schedule.length - 1)];
  P.cost = P.maxCost;
  for (const c of P.board) {
    c.rested = false;
    c.abilityUsed = false;
  }
  game.current = pi;

  // 先攻の最初のターンは山札から引かない
  const skipDraw = pi === game.first && P.turns === 1;
  if (!skipDraw) draw(game, pi, 1);

  addLog(game, `${game.seats[pi].name} のターン（コスト ${P.maxCost}）${skipDraw ? '※先攻は最初のターンはドローなし' : ''}`);
}

function destroy(game, pi, c) {
  const P = game.players[pi];
  P.board = P.board.filter((x) => x.id !== c.id);
  P.trash.push({ id: c.id, defId: c.defId });
  addLog(game, `${CARD_DEFS[c.defId].name} が破壊された。`);
}

function checkWin(game) {
  if (game.phase !== 'playing') return true;
  for (let pi = 0; pi < 2; pi++) {
    if (game.players[pi].life <= 0) {
      finishGame(game, 1 - pi, 'ライフが0になった');
      return true;
    }
  }
  return false;
}

function finishGame(game, winner, reason) {
  game.phase = 'finished';
  game.winner = winner;
  game.pending = null;
  game.combat = null;
  clearTimeout(game.timer);
  addLog(game, `${game.seats[winner].name} の勝利！（${reason}）`);
}

// ===== クイズ =====
function armTimer(game, pending, onTimeout) {
  clearTimeout(game.timer);
  game.timer = setTimeout(() => {
    if (game.pending !== pending) return;
    try {
      onTimeout();
    } catch (e) {
      console.error('[tcg] timeout error', e);
    }
    settle(game);
  }, QUIZ_MS + 1500);
}

function ask(game, owner, genres, title, cb, step = null) {
  let q = null;
  for (const g of shuffle(genres)) {
    q = makeQuestion(g);
    if (q) break;
  }
  if (!q) {
    addLog(game, '出題できる問題がありませんでした（データ不足）。');
    cb(false);
    return;
  }
  const pending = {
    kind: 'quiz',
    owner,
    title,
    genre: q.label,
    lines: q.lines,
    deadline: Date.now() + QUIZ_MS,
    q,
    cb,
    step,
  };
  game.pending = pending;
  armTimer(game, pending, () => resolveQuiz(game, pending, '', true));
}

function askSeq(game, owner, specs, title, done) {
  const results = [];
  const next = (i) => {
    if (i >= specs.length) {
      done(results);
      return;
    }
    ask(
      game,
      owner,
      specs[i],
      title,
      (ok) => {
        results.push(ok);
        next(i + 1);
      },
      specs.length > 1 ? `${i + 1}/${specs.length}` : null
    );
  };
  next(0);
}

function resolveQuiz(game, pending, text, timeout) {
  const ok = !timeout && pending.q.check(text);
  game.pending = null;
  clearTimeout(game.timer);
  game.flashSeq += 1;
  game.flash = {
    seq: game.flashSeq,
    owner: pending.owner,
    ok,
    timeout: !!timeout,
    genre: pending.genre,
    reveal: pending.q.reveal,
  };
  addLog(
    game,
    `【${pending.genre}】${game.seats[pending.owner].name}：${timeout ? '時間切れ' : ok ? '正解！' : '不正解'}` +
      `（回答：${timeout ? 'なし' : String(text ?? '').trim().slice(0, 40) || 'なし'} ／ 答え：${pending.q.reveal}）`
  );
  pending.cb(ok);
}

function askChoose(game, owner, title, options, cb) {
  if (!options.length) {
    cb(null);
    return;
  }
  const pending = { kind: 'choose', owner, title, options, deadline: Date.now() + QUIZ_MS, cb };
  game.pending = pending;
  armTimer(game, pending, () => {
    game.pending = null;
    cb(null);
  });
}

function loseLife(game, target, n) {
  const P = game.players[target];
  P.life = Math.max(0, P.life - n);
  P.lifeHp = LIFE_HP;
  addLog(game, `${game.seats[target].name} のライフが${n}減った！（残り${P.life}）`);
  if (checkWin(game)) return;
  ask(game, target, ALL_GENRES, 'ライフ減少ボーナス：正解でカードを2枚引く', (ok) => {
    if (ok) {
      const n2 = draw(game, target, 2);
      addLog(game, `${game.seats[target].name} はカードを${n2}枚引いた。`);
    }
  });
}

// ライフ1つにつき耐久力 LIFE_HP。1回の攻撃で減るライフは最大1で、余剰ダメージは次のライフに持ち越さない
function damageLife(game, target, dmg) {
  const P = game.players[target];
  P.lifeHp -= dmg;
  if (P.lifeHp > 0) {
    addLog(game, `${game.seats[target].name} のライフに${dmg}ダメージ！（耐久力 残り${P.lifeHp}/${LIFE_HP}）`);
    return;
  }
  loseLife(game, target, 1);
}

// ===== 戦闘 =====
function resolveBattle(game, att, attOwner, def, defOwner, noKill = false) {
  const a = power(att);
  const d = power(def);
  const an = CARD_DEFS[att.defId].name;
  const dn = CARD_DEFS[def.defId].name;
  addLog(game, `バトル：${an}(${a}) VS ${dn}(${d})`);

  if (a > d) {
    destroy(game, defOwner, def);
  } else if (a < d) {
    if (!noKill) destroy(game, attOwner, att);
    else addLog(game, `${dn} は相手を破壊できない。`);
  } else {
    destroy(game, defOwner, def);
    if (!noKill) destroy(game, attOwner, att);
  }
  att.temp = 0;
  def.temp = 0;
  game.combat = null;
}

function resolveDirect(game, att, attOwner) {
  game.combat = null;
  const dmg = power(att);
  att.temp = 0;
  damageLife(game, 1 - attOwner, dmg);
}

function afterAttackTriggers(game) {
  const cb = game.combat;
  if (!cb) return;
  const found = findChar(game, cb.attId);
  if (!found) {
    game.combat = null;
    return;
  }
  const att = found.c;
  const attOwner = found.pi;
  const defOwner = 1 - attOwner;

  if (cb.target === 'player') {
    const blockers = cb.unblockable
      ? []
      : game.players[defOwner].board.filter((c) => CARD_DEFS[c.defId].blocker && !c.rested);
    if (!blockers.length) {
      resolveDirect(game, att, attOwner);
      return;
    }
    const pending = {
      kind: 'block',
      owner: defOwner,
      options: blockers.map((c) => c.id),
      attId: att.id,
      deadline: Date.now() + QUIZ_MS,
    };
    game.pending = pending;
    armTimer(game, pending, () => {
      game.pending = null;
      addLog(game, 'ブロックしなかった。');
      resolveDirect(game, att, attOwner);
    });
    return;
  }

  const hit = findChar(game, cb.target);
  if (!hit) {
    game.combat = null;
    return;
  }
  defendTrigger(game, hit.pi, hit.c, 'defend', (noKill) => {
    resolveBattle(game, att, attOwner, hit.c, hit.pi, noKill);
  });
}

// 防御側（攻撃された／ブロックした）のカード効果
function defendTrigger(game, owner, c, role, cont) {
  switch (c.defId) {
    case 'zori':
      ask(game, owner, ['subBetween'], 'ゾリ：正解でパワー+2', (ok) => {
        if (ok) c.temp += 2;
        cont(false);
      });
      return;
    case 'chappy':
      if (role !== 'block') break;
      ask(game, owner, ['before'], 'チャッピー：正解でパワー+3（相手を破壊できない）', (ok) => {
        if (ok) c.temp += 3;
        cont(ok);
      });
      return;
    case 'riesen':
      if (role !== 'block') break;
      ask(game, owner, ['hobby', 'hate'], 'リーゼンコーラ：正解でパワー+3', (ok) => {
        if (ok) c.temp += 3;
        cont(false);
      });
      return;
    default:
      break;
  }
  cont(false);
}

function attackTriggers(game, attOwner, att, cont) {
  const cb = game.combat;
  switch (att.defId) {
    case 'hanap':
      ask(game, attOwner, ['season', 'hobby', 'hate'], '鼻ップ：正解でパワー+2＆ブロックされない', (ok) => {
        if (ok) {
          att.temp += 2;
          cb.unblockable = true;
        }
        cont();
      });
      return;
    case 'hojiro':
      askSeq(game, attOwner, [['between'], ['wazaKanji']], 'ホオジロ：2問正解でパワー+4', (res) => {
        if (res.every(Boolean)) att.temp += 4;
        cont();
      });
      return;
    case 'zori':
      ask(game, attOwner, ['subBetween'], 'ゾリ：正解でパワー+2', (ok) => {
        if (ok) att.temp += 2;
        cont();
      });
      return;
    case 'mugicha5':
      askSeq(
        game,
        attOwner,
        [['hint'], ['between'], ['wazaKanji']],
        '麦茶んファイブ：正解1問ごとにパワー+1（2問以上間違えると攻撃失敗）',
        (res) => {
          const right = res.filter(Boolean).length;
          if (3 - right >= 2) {
            addLog(game, '麦茶んファイブの攻撃は失敗した。');
            att.temp = 0;
            game.combat = null;
            return;
          }
          att.temp += right;
          cont();
        }
      );
      return;
    default:
      cont();
  }
}

// ===== 起動効果 =====
function useAbility(game, pi, charId, genre) {
  const P = game.players[pi];
  const c = P.board.find((x) => x.id === charId);
  if (!c) fail('そのキャラクターは場にいません。');
  if (!ACTIVE_CARDS.has(c.defId)) fail('このカードに起動効果はありません。');
  if (c.abilityUsed) fail('この効果はこのターンすでに使用しました。');
  const name = CARD_DEFS[c.defId].name;

  switch (c.defId) {
    case 'mugicha': {
      if (!MUGICHA_GENRES.includes(genre)) fail('強化するジャンルを選んでください。');
      if (c.genresUsed.includes(genre)) fail('そのジャンルでは、もうこのカードを強化できません。');
      c.abilityUsed = true;
      c.genresUsed.push(genre);
      ask(game, pi, [genre], `${name}：正解でパワー+1（永続）`, (ok) => {
        if (ok) c.bonus += 1;
      });
      return;
    }
    case 'dorobou':
      c.abilityUsed = true;
      ask(game, pi, ['wazaKanji'], `${name}：正解で相手のライフに2ダメージ`, (ok) => {
        if (ok) damageLife(game, 1 - pi, 2);
      });
      return;
    case 'allholiday':
      c.abilityUsed = true;
      ask(game, pi, ['before'], `${name}：正解で山札を1枚引く`, (ok) => {
        if (ok) draw(game, pi, 1);
      });
      return;
    case 'corobokkle':
      c.abilityUsed = true;
      askSeq(game, pi, [['hint'], ['between']], `${name}：両方正解で相手キャラ1体をダウン`, (res) => {
        if (!res.every(Boolean)) return;
        const options = game.players[1 - pi].board.filter((x) => !x.rested).map((x) => x.id);
        askChoose(game, pi, 'ダウンさせる相手キャラを選んでください', options, (id) => {
          const t = id && findChar(game, id);
          if (t) {
            t.c.rested = true;
            addLog(game, `${CARD_DEFS[t.c.defId].name} がダウンした。`);
          }
        });
      });
      return;
    case 'kavell':
      c.abilityUsed = true;
      ask(game, pi, ALL_GENRES, `${name}：正解で味方のダウン中キャラを1体回復`, (ok) => {
        if (!ok) return;
        const options = P.board.filter((x) => x.rested).map((x) => x.id);
        askChoose(game, pi, '回復させる味方キャラを選んでください', options, (id) => {
          const t = id && findChar(game, id);
          if (t) {
            t.c.rested = false;
            addLog(game, `${CARD_DEFS[t.c.defId].name} が回復した。`);
          }
        });
      });
      return;
    case 'sloop':
      c.abilityUsed = true;
      ask(game, pi, ALL_GENRES, `${name}：正解でスループ以外の味方全員のパワー+1（永続）`, (ok) => {
        if (!ok) return;
        for (const x of P.board) if (x.id !== c.id) x.bonus += 1;
        addLog(game, 'スループ以外の味方キャラ全員のパワーが+1された。');
      });
      return;
    default:
      fail('未対応の効果です。');
  }
}

// ===== アクション =====
function actPlay(game, pi, cardId, slot) {
  const P = game.players[pi];
  const card = P.hand.find((c) => c.id === cardId);
  if (!card) fail('そのカードは手札にありません。');
  const def = CARD_DEFS[card.defId];
  if (!Number.isInteger(slot) || slot < 0 || slot >= BOARD_SIZE) fail('枠が正しくありません。');
  const occupant = P.board.find((c) => c.slot === slot);
  if (occupant && P.board.length < BOARD_SIZE) fail('空いている枠があるときは交換できません。');
  if (def.cost > P.cost) fail('コストが足りません。');

  if (occupant) {
    P.board = P.board.filter((x) => x.id !== occupant.id);
    P.trash.push({ id: occupant.id, defId: occupant.defId });
    addLog(game, `${game.seats[pi].name} は ${CARD_DEFS[occupant.defId].name} をトラッシュへ送った。`);
  }
  P.cost -= def.cost;
  P.hand = P.hand.filter((c) => c.id !== cardId);
  const c = {
    id: card.id,
    defId: card.defId,
    slot,
    rested: false,
    bonus: 0,
    temp: 0,
    turnTemp: 0,
    haste: false,
    summonedOn: P.turns,
    abilityUsed: false,
    genresUsed: [],
  };
  P.board.push(c);
  addLog(game, `${game.seats[pi].name} が ${def.name} を出した。`);

  if (card.defId === 'prince') {
    ask(game, pi, ['subKanji'], 'ミス・プリンス：正解でこのターン攻撃でき、パワー+2', (ok) => {
      if (ok) {
        c.haste = true;
        c.turnTemp += 2;
      }
    });
  }
}

function actAttack(game, pi, attackerId, target) {
  const P = game.players[pi];
  const att = P.board.find((c) => c.id === attackerId);
  if (!att) fail('攻撃するキャラクターが場にいません。');
  if (att.rested) fail('そのキャラクターはダウン中です。');
  if (att.summonedOn >= P.turns && !att.haste) fail('場に出したターンは攻撃できません。');

  if (target === 'player') {
    // 直接攻撃
  } else {
    const t = game.players[1 - pi].board.find((c) => c.id === target);
    if (!t) fail('攻撃対象が場にいません。');
    if (!t.rested) fail('ダウンしている相手キャラにしか攻撃できません。');
  }

  att.rested = true;
  game.combat = { attId: att.id, target, unblockable: false };
  addLog(
    game,
    `${CARD_DEFS[att.defId].name} が${target === 'player' ? 'プレイヤー' : CARD_DEFS[findChar(game, target).c.defId].name}に攻撃！`
  );
  attackTriggers(game, pi, att, () => afterAttackTriggers(game));
}

function actBlock(game, pi, blockerId) {
  const p = game.pending;
  if (!p || p.kind !== 'block' || p.owner !== pi) fail('今はブロックできません。');
  const cb = game.combat;
  const found = findChar(game, cb.attId);
  if (!found) {
    game.pending = null;
    game.combat = null;
    return;
  }
  const att = found.c;
  const attOwner = found.pi;

  clearTimeout(game.timer);
  game.pending = null;

  if (!blockerId) {
    addLog(game, 'ブロックしなかった。');
    resolveDirect(game, att, attOwner);
    return;
  }
  if (!p.options.includes(blockerId)) fail('そのキャラクターではブロックできません。');
  const blocker = game.players[pi].board.find((c) => c.id === blockerId);
  blocker.rested = true;
  addLog(game, `${CARD_DEFS[blocker.defId].name} がブロック！`);
  defendTrigger(game, pi, blocker, 'block', (noKill) => {
    resolveBattle(game, att, attOwner, blocker, pi, noKill);
  });
}

function actEnd(game, pi) {
  for (const c of game.players[pi].board) {
    c.temp = 0;
    c.turnTemp = 0;
    c.haste = false;
  }
  startTurn(game, 1 - pi);
}

// ===== 状態送信 =====
function charView(game, pi, c) {
  const def = CARD_DEFS[c.defId];
  const P = game.players[pi];
  const mine = pi === game.current && game.phase === 'playing';
  return {
    id: c.id,
    defId: c.defId,
    name: def.name,
    slot: c.slot,
    rested: c.rested,
    power: power(c),
    cost: def.cost,
    blocker: def.blocker,
    text: def.text,
    canAttack: mine && !c.rested && (c.summonedOn < P.turns || c.haste),
    hasAbility: ACTIVE_CARDS.has(c.defId),
    abilityUsed: c.abilityUsed,
    genresUsed: c.genresUsed,
  };
}

function pendingView(game, viewer) {
  const p = game.pending;
  if (!p) return null;
  const base = {
    kind: p.kind,
    mine: p.owner === viewer,
    deadline: p.deadline,
  };
  if (p.kind === 'quiz') {
    return { ...base, title: p.title, genre: p.genre, lines: p.lines, step: p.step };
  }
  if (p.kind === 'choose') {
    return { ...base, title: p.title, options: p.options };
  }
  if (p.kind === 'block') {
    const att = findChar(game, p.attId);
    return {
      ...base,
      options: p.options,
      attackerName: att ? CARD_DEFS[att.c.defId].name : '',
      attackerPower: att ? power(att.c) : 0,
    };
  }
  return base;
}

function viewFor(game, viewer) {
  const base = {
    roomId: game.roomId,
    phase: game.phase,
    you: viewer,
    seats: game.seats.map((s) => (s ? { name: s.name, connected: s.connected } : null)),
    log: game.log.slice(-30),
    flash: game.flash,
  };
  if (game.phase === 'waiting') return base;

  const make = (pi, own) => {
    const P = game.players[pi];
    return {
      name: game.seats[pi].name,
      connected: game.seats[pi].connected,
      life: P.life,
      lifeHp: P.lifeHp,
      lifeMaxHp: LIFE_HP,
      deckCount: P.deck.length,
      trash: P.trash.map((t) => ({ id: t.id, defId: t.defId, name: CARD_DEFS[t.defId].name })),
      handCount: P.hand.length,
      cost: P.cost,
      maxCost: P.maxCost,
      board: P.board.map((c) => charView(game, pi, c)),
      hand: own
        ? P.hand.map((c) => {
            const def = CARD_DEFS[c.defId];
            return {
              id: c.id,
              defId: c.defId,
              name: def.name,
              cost: def.cost,
              power: def.power,
              blocker: def.blocker,
              text: def.text,
            };
          })
        : undefined,
    };
  };

  return {
    ...base,
    current: game.current,
    first: game.first,
    turnNo: game.players[0].turns + game.players[1].turns,
    me: make(viewer, true),
    opp: make(1 - viewer, false),
    pending: pendingView(game, viewer),
    winner: game.winner,
  };
}

function broadcast(game) {
  game.seats.forEach((s, i) => {
    if (s?.socketId) IO.to(s.socketId).emit('tcg:state', viewFor(game, i));
  });
}

function settle(game) {
  checkWin(game);
  broadcast(game);
}

// ===== Socket =====
export function setupTcgMode(io) {
  IO = io;

  io.on('connection', (socket) => {
    const withGame = (fn) => {
      const roomId = socket.data.tcgRoom;
      const seat = socket.data.tcgSeat;
      const game = games.get(roomId);
      if (!game || seat === undefined) return;
      try {
        fn(game, seat);
        settle(game);
      } catch (e) {
        if (e instanceof GameError) socket.emit('tcg:error', { message: e.message });
        else {
          console.error('[tcg] error', e);
          socket.emit('tcg:error', { message: 'サーバーエラーが発生しました。' });
        }
      }
    };

    const needPlaying = (game, seat) => {
      if (game.phase !== 'playing') fail('対戦中ではありません。');
      return seat;
    };

    const needMyFreeTurn = (game, seat) => {
      needPlaying(game, seat);
      if (game.current !== seat) fail('相手のターンです。');
      if (game.pending) fail('解決中の処理があります。');
    };

    socket.on('tcg:join', (payload = {}) => {
      const roomId = String(payload.roomId || '').slice(0, 32);
      const clientId = String(payload.clientId || '').slice(0, 64);
      const name = String(payload.name || 'プレイヤー').slice(0, 20);
      if (!roomId || !clientId) return;

      let game = games.get(roomId);
      if (!game) {
        game = createGame(roomId);
        games.set(roomId, game);
      }
      clearTimeout(game.cleanup);

      let seat = game.seats.findIndex((s) => s && s.clientId === clientId);
      if (seat === -1) {
        seat = game.seats.findIndex((s) => !s);
        if (seat === -1 || game.phase !== 'waiting') {
          socket.emit('tcg:error', { message: 'この部屋はすでに満員です。', fatal: true });
          return;
        }
        const deck = normalizeDeck(payload.deck);
        if (!deck) {
          socket.emit('tcg:error', { message: 'デッキが不正です（30枚・同名カードは3枚まで）。', fatal: true });
          return;
        }
        game.seats[seat] = { clientId, name, socketId: socket.id, connected: true, deck };
      } else {
        Object.assign(game.seats[seat], { socketId: socket.id, connected: true, name });
      }

      socket.data.tcgRoom = roomId;
      socket.data.tcgSeat = seat;

      if (game.phase === 'waiting' && game.seats[0] && game.seats[1]) startGame(game);
      settle(game);
    });

    socket.on('tcg:play', ({ cardId, slot } = {}) =>
      withGame((game, seat) => {
        needMyFreeTurn(game, seat);
        actPlay(game, seat, Number(cardId), Number(slot));
      })
    );

    socket.on('tcg:attack', ({ attackerId, target } = {}) =>
      withGame((game, seat) => {
        needMyFreeTurn(game, seat);
        actAttack(game, seat, Number(attackerId), target === 'player' ? 'player' : Number(target));
      })
    );

    socket.on('tcg:ability', ({ charId, genre } = {}) =>
      withGame((game, seat) => {
        needMyFreeTurn(game, seat);
        useAbility(game, seat, Number(charId), String(genre || ''));
      })
    );

    socket.on('tcg:answer', ({ text } = {}) =>
      withGame((game, seat) => {
        needPlaying(game, seat);
        const p = game.pending;
        if (!p || p.kind !== 'quiz' || p.owner !== seat) fail('今は回答できません。');
        resolveQuiz(game, p, String(text ?? '').slice(0, 200), false);
      })
    );

    socket.on('tcg:block', ({ blockerId } = {}) =>
      withGame((game, seat) => {
        needPlaying(game, seat);
        actBlock(game, seat, blockerId ? Number(blockerId) : null);
      })
    );

    socket.on('tcg:choose', ({ targetId } = {}) =>
      withGame((game, seat) => {
        needPlaying(game, seat);
        const p = game.pending;
        if (!p || p.kind !== 'choose' || p.owner !== seat) fail('今は選択できません。');
        const id = targetId ? Number(targetId) : null;
        if (id !== null && !p.options.includes(id)) fail('その対象は選べません。');
        clearTimeout(game.timer);
        game.pending = null;
        p.cb(id);
      })
    );

    socket.on('tcg:end', () =>
      withGame((game, seat) => {
        needMyFreeTurn(game, seat);
        actEnd(game, seat);
      })
    );

    socket.on('tcg:surrender', () =>
      withGame((game, seat) => {
        needPlaying(game, seat);
        finishGame(game, 1 - seat, `${game.seats[seat].name} が降参した`);
      })
    );

    socket.on('disconnect', () => {
      const game = games.get(socket.data.tcgRoom);
      const seat = socket.data.tcgSeat;
      if (!game || seat === undefined) return;
      const s = game.seats[seat];
      if (!s || s.socketId !== socket.id) return;
      s.connected = false;
      s.socketId = null;
      broadcast(game);
      if (game.seats.every((x) => !x || !x.connected)) {
        clearTimeout(game.cleanup);
        game.cleanup = setTimeout(() => {
          clearTimeout(game.timer);
          games.delete(game.roomId);
        }, 10 * 60 * 1000);
      }
    });
  });
}
