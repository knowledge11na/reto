import { loadExtraCharacters, loadVivreProfiles } from './lib/freeGameData.js';

const symbol = (char) => /[\s「」『』（）()［］【】〈〉《》〔〕、。・，．！？!?：:；;／/\\＼〜～—−―…‥“”"']/u.test(char);
const pick = (items) => items[Math.floor(Math.random() * items.length)];
const normalize = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase()
  .replace(/[〜～~ー‐-‒–—―−]/g, 'ー')
  .replace(/[ぁぃぅぇぉっゃゅょゎゔ]/g, (char) => ({ ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お', っ: 'つ', ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', ゎ: 'わ', ゔ: 'う' })[char]);

function answerMatches(answer, name) {
  const candidates = [name];
  const matches = [...name.matchAll(/(?:（([^（）]*)）|\(([^()]*)\))/g)];
  if (matches.length) {
    candidates.push(name.replace(/（[^（）]*）|\([^()]*\)/g, ''));
    for (const match of matches) candidates.push(match[1] ?? match[2]);
  }
  return !!normalize(answer) && candidates.some((item) => normalize(item) === normalize(answer));
}

function judgeNumber(guess, answer) {
  if (guess === '不明' || answer === '不明') return guess === answer ? 'green' : 'gray';
  return Number(guess) === Number(answer) ? 'green' : Number(guess) < Number(answer) ? 'up' : 'down';
}

function judgeList(guess, answer) {
  const shared = guess.filter((item) => answer.includes(item));
  if (shared.length === guess.length && shared.length === answer.length) return 'green';
  return shared.length ? 'yellow' : 'gray';
}

function vivreResult(profile, target, player) {
  const born = (p) => [p.bornSea, p.bornPlace].filter((v) => v && v !== '不明');
  return {
    profile, player, correct: profile.name === target.name,
    result: {
      number: judgeNumber(profile.number, target.number), chapter: judgeNumber(profile.chapter, target.chapter),
      age: judgeNumber(profile.age, target.age), height: judgeNumber(profile.height, target.height),
      blood: profile.blood === target.blood ? 'green' : 'gray',
      gender: profile.gender === target.gender ? 'green' : 'gray',
      born: judgeList(born(profile), born(target)), family: judgeList(profile.family, target.family),
    },
  };
}

export function setupFreeKnowledgeModes(io, loaders = {}) {
  const games = new Map();
  const loadPunk = loaders.punk || loadExtraCharacters;
  const loadVivre = loaders.vivre || loadVivreProfiles;

  function view(game, seat) {
    const base = {
      kind: game.kind, phase: game.phase, you: seat, host: seat === 0,
      players: game.players.map((p) => ({ name: p.name, connected: !!p.socketId })),
      deadline: game.deadline, settings: game.settings,
    };
    if (game.kind === 'vivre') {
      return { ...base, history: game.history || [], turn: game.turn, winner: game.winner,
        answer: game.phase === 'result' ? game.target.name : null };
    }
    if (game.phase === 'setup') return base;
    const finished = game.phase === 'result';
    const author = seat !== game.stella;
    return {
      ...base, stella: game.stella, role: finished ? game.roles : game.roles[seat],
      character: author || game.phase === 'discussion' || finished ? game.character.name : null,
      template: author && game.phase === 'input'
        ? game.chars.map((char) => symbol(char) && game.settings.symbolsOpen ? char : null)
        : null,
      owners: game.owners,
      draft: author && game.phase === 'input' ? game.drafts[seat] : null,
      stealth: game.roles[seat] === 'york' && game.phase === 'input' ? game.stealth : null,
      stealthLeft: game.roles[seat] === 'york' && game.phase === 'input' ? game.settings.stealthCount - game.stealth.length : 0,
      composed: game.phase !== 'input' ? game.composed : null,
      correctDescription: finished ? game.character.description : null,
      drafts: finished ? game.drafts : null,
      winner: finished ? game.winner : null,
      message: game.message,
    };
  }

  function broadcast(game) {
    game.players.forEach((player, index) => {
      if (player.socketId) io.to(player.socketId).emit('knowledge:state', view(game, index));
    });
  }

  function timer(game, duration, callback) {
    clearTimeout(game.timer);
    game.deadline = Date.now() + duration;
    game.timer = setTimeout(() => {
      try { callback(); broadcast(game); }
      catch (error) { console.error('[knowledge] timer error', error); }
    }, duration);
  }

  function compose(game) {
    const overrides = new Map();
    const hidden = new Set();
    for (const action of game.stealth) {
      if (action.type === 'character') overrides.set(action.index, action.value);
      else action.indexes.forEach((index) => hidden.add(index));
    }
    game.composed = game.chars.map((char, index) => {
      if (hidden.has(index)) return '';
      if (symbol(char) && game.settings.symbolsOpen) return char;
      return overrides.get(index) || game.drafts[game.owners[index]]?.[index] || '？';
    });
    game.phase = 'answer';
    game.deadline = null;
  }

  function startPunk(game, settings) {
    const minutes = Number(settings.minutes);
    const stealthCount = Number(settings.stealthCount);
    const discussion = Number(settings.discussion);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 30 ||
        !Number.isInteger(stealthCount) || stealthCount < 0 || stealthCount > 10 ||
        ![30, 60, 90, 120, 180, 300].includes(discussion) ||
        typeof settings.symbolsOpen !== 'boolean') throw new Error('設定が正しくありません。');
    let stella = settings.stella === 'random' ? Math.floor(Math.random() * 4) : Number(settings.stella);
    if (!Number.isInteger(stella) || stella < 0 || stella > 3) throw new Error('回答者の設定が正しくありません。');
    const characters = loadPunk();
    game.character = pick(characters);
    game.chars = Array.from(game.character.description);
    game.stella = stella;
    const authors = [0, 1, 2, 3].filter((index) => index !== stella);
    const york = pick(authors);
    game.roles = game.players.map((_, index) => index === stella ? 'stella' : index === york ? 'york' : 'satellite');
    let position = 0;
    game.owners = game.chars.map((char) => symbol(char) ? null : authors[position++ % authors.length]);
    game.drafts = game.players.map(() => Array(game.chars.length).fill(''));
    game.stealth = [];
    game.settings = { minutes, stealthCount, discussion, symbolsOpen: settings.symbolsOpen, stella };
    game.phase = 'input';
    timer(game, minutes * 60000, () => compose(game));
  }

  function applyVivreGuess(game, profile, player) {
    const result = vivreResult(profile, game.target, player);
    game.history.push(result);
    if (result.correct) {
      clearTimeout(game.timer);
      game.deadline = null;
      game.phase = 'result';
      game.winner = player;
    } else if (game.settings.mode.startsWith('battle')) {
      game.turn = (game.turn + 1) % game.players.length;
      armVivreTurn(game);
    }
  }

  function armVivreTurn(game) {
    timer(game, 60000, () => {
      const options = game.profiles.filter((p) => p.name !== game.target.name && !game.history.some((h) => h.profile.name === p.name));
      if (options.length) applyVivreGuess(game, pick(options), game.turn);
      else { game.turn = (game.turn + 1) % game.players.length; armVivreTurn(game); }
    });
  }

  function startVivre(game, settings) {
    const mode = settings.mode;
    if (!['battle-normal', 'battle-hard', 'party-normal', 'party-hard'].includes(mode)) throw new Error('モードが正しくありません。');
    game.profiles = loadVivre();
    game.target = pick(game.profiles);
    const initial = game.profiles.filter((p) => p.name !== game.target.name);
    game.history = [vivreResult(pick(initial), game.target, null)];
    game.settings = { mode };
    game.turn = 0;
    game.phase = 'playing';
    if (mode.startsWith('battle')) armVivreTurn(game);
  }

  io.on('connection', (socket) => {
    socket.on('knowledge:join', ({ roomId, token } = {}) => {
      const game = games.get(String(roomId));
      const seat = game?.players.findIndex((player) => player.token === token) ?? -1;
      if (!game || seat < 0) {
        socket.emit('knowledge:error', { message: 'フリーマッチの参加者として入室してください。', fatal: true });
        return;
      }
      clearTimeout(game.cleanup);
      game.players[seat].socketId = socket.id;
      socket.data.knowledgeRoom = game.roomId;
      socket.data.knowledgeSeat = seat;
      broadcast(game);
    });

    socket.on('knowledge:action', (payload = {}) => {
      const game = games.get(socket.data.knowledgeRoom);
      const seat = socket.data.knowledgeSeat;
      try {
        if (!game || seat === undefined || game.players[seat].socketId !== socket.id) throw new Error('接続を確認してください。');
        const { type } = payload;
        if (type === 'start') {
          if (seat !== 0 || game.phase !== 'setup' || game.players.some((p) => !p.socketId)) throw new Error('全員の接続後、部屋主が開始してください。');
          if (game.kind === 'punk') startPunk(game, payload.settings || {});
          else startVivre(game, payload.settings || {});
        } else if (game.kind === 'punk' && type === 'draft') {
          if (game.phase !== 'input' || seat === game.stella || Date.now() >= game.deadline) throw new Error('今は入力できません。');
          const index = Number(payload.index);
          if (!Number.isInteger(index) || index < 0 || index >= game.chars.length || (symbol(game.chars[index]) && game.settings.symbolsOpen)) throw new Error('その場所には入力できません。');
          game.drafts[seat][index] = Array.from(String(payload.value ?? ''))[0] || '';
        } else if (game.kind === 'punk' && type === 'stealth') {
          if (game.phase !== 'input' || game.roles[seat] !== 'york' || Date.now() >= game.deadline || game.stealth.length >= game.settings.stealthCount) throw new Error('ステルスを使用できません。');
          const index = Number(payload.index);
          const value = Array.from(String(payload.value ?? ''))[0];
          if (!Number.isInteger(index) || !game.chars[index] || symbol(game.chars[index]) || game.owners[index] === seat || !value) throw new Error('ステルスの対象が正しくありません。');
          game.stealth.push({ type: 'character', index, value });
        } else if (game.kind === 'punk' && type === 'hide-symbols') {
          const indexes = payload.indexes;
          if (game.phase !== 'input' || game.roles[seat] !== 'york' || Date.now() >= game.deadline || !game.settings.symbolsOpen || game.stealth.length >= game.settings.stealthCount ||
              !Array.isArray(indexes) || !indexes.length || indexes.length > 3 || new Set(indexes).size !== indexes.length ||
              indexes.some((index) => !Number.isInteger(index) || !game.chars[index] || !symbol(game.chars[index]))) throw new Error('記号ステルスの対象が正しくありません。');
          game.stealth.push({ type: 'symbol', indexes });
        } else if (game.kind === 'punk' && type === 'undo-stealth') {
          if (game.phase !== 'input' || game.roles[seat] !== 'york' || Date.now() >= game.deadline || !game.stealth.length) throw new Error('取り消せるステルスがありません。');
          game.stealth.pop();
        } else if (game.kind === 'punk' && type === 'answer') {
          if (game.phase !== 'answer' || seat !== game.stella) throw new Error('今は回答できません。');
          if (!String(payload.answer || '').trim()) throw new Error('回答を入力してください。');
          if (answerMatches(payload.answer, game.character.name)) {
            game.phase = 'result'; game.winner = 'stella'; game.message = '正解！ ベガパンク側の勝利です。';
          } else {
            game.phase = 'discussion'; game.message = '不正解。ヨークを探してください。';
            timer(game, game.settings.discussion * 1000, () => { game.deadline = null; });
          }
        } else if (game.kind === 'punk' && type === 'vote') {
          if (game.phase !== 'discussion' || seat !== game.stella) throw new Error('回答者だけがヨークを選べます。');
          const target = Number(payload.target);
          if (!Number.isInteger(target) || target < 0 || target >= 4 || target === game.stella) throw new Error('対象を選んでください。');
          clearTimeout(game.timer); game.deadline = null;
          game.winner = game.roles[target] === 'york' ? 'stella' : 'york';
          game.message = game.winner === 'stella' ? 'ヨークを見抜きました。' : 'ヨークを見抜けませんでした。';
          game.phase = 'result';
        } else if (game.kind === 'vivre' && type === 'guess') {
          if (game.phase !== 'playing' || (game.settings.mode.startsWith('battle') && (seat !== game.turn || Date.now() >= game.deadline))) throw new Error('今は回答できません。');
          const profile = game.profiles.find((p) => p.name === payload.name);
          if (!profile || game.history.some((h) => h.profile.name === profile.name)) throw new Error('未回答のキャラクターを選んでください。');
          applyVivreGuess(game, profile, seat);
        } else throw new Error('今はその操作ができません。');
        broadcast(game);
      } catch (error) {
        console.error('[knowledge] action error:', error.message);
        socket.emit('knowledge:error', { message: error.message });
      }
    });
    socket.on('disconnect', () => {
      const game = games.get(socket.data.knowledgeRoom);
      const player = game?.players[socket.data.knowledgeSeat];
      if (player?.socketId === socket.id) {
        player.socketId = null;
        broadcast(game);
        if (game.players.every((p) => !p.socketId)) {
          game.cleanup = setTimeout(() => {
            clearTimeout(game.timer);
            if (games.get(game.roomId) === game) games.delete(game.roomId);
          }, 10 * 60 * 1000);
        }
      }
    });
  });

  return {
    prepare(roomId, kind, players) {
      const old = games.get(String(roomId));
      if (old && old.phase !== 'result') return false;
      if (old) { clearTimeout(old.timer); clearTimeout(old.cleanup); }
      const game = { roomId: String(roomId), kind, players: players.map((p) => ({ ...p, socketId: null })), phase: 'setup', settings: null, deadline: null };
      game.cleanup = setTimeout(() => {
        if (games.get(game.roomId) === game) games.delete(game.roomId);
      }, 10 * 60 * 1000);
      games.set(game.roomId, game);
      return true;
    },
    has(roomId) {
      return games.has(String(roomId));
    },
  };
}
