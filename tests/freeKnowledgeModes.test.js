import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupFreeKnowledgeModes } from '../freeKnowledgeModes.js';

const profiles = ['A', 'B', 'C', 'D'].map((name, index) => ({
  name, number: index + 1, chapter: String(index + 1), age: String(index + 1),
  height: String(index + 1), blood: 'A', bornSea: '海', bornPlace: '不明',
  gender: '男', family: [],
}));

function harness(kind, size) {
  const sockets = new Map();
  let connect;
  const io = {
    on: (_, fn) => { connect = fn; },
    to: (id) => ({ emit: (event, state) => {
      if (event === 'knowledge:state') sockets.get(id).state = state;
    } }),
  };
  const service = setupFreeKnowledgeModes(io, {
    punk: () => [{ name: 'お題', description: 'あいうえお。' }],
    vivre: () => profiles,
  });
  service.prepare('room', kind, Array.from({ length: size }, (_, i) => ({ name: `P${i}`, token: `token${i}` })));
  const join = (i) => {
    const handlers = {};
    const s = {
      id: `${i}-${sockets.size}`, data: {}, errors: [],
      on: (event, fn) => { handlers[event] = fn; },
      emit: (event, value) => { if (event === 'knowledge:error') s.errors.push(value.message); },
      send: (event, value) => handlers[event](value),
    };
    sockets.set(s.id, s);
    connect(s);
    s.send('knowledge:join', { roomId: 'room', token: `token${i}` });
    return s;
  };
  return { join };
}

test('punk simultaneous drafts stay private, then timer produces the composed sentence', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { join } = harness('punk', 4);
  const players = [0, 1, 2, 3].map(join);
  players[0].send('knowledge:action', { type: 'start', settings: { stella: '0', minutes: 1, stealthCount: 1, discussion: 30, symbolsOpen: true } });
  assert.equal(players[0].state.character, null);
  assert.equal(players[0].state.draft, null);
  assert.equal(players[1].state.role === 'york' || players[2].state.role === 'york' || players[3].state.role === 'york', true);
  for (let index = 0; index < 5; index++) {
    const owner = players[1].state.owners[index];
    players[owner].send('knowledge:action', { type: 'draft', index, value: 'あいうえお'[index] });
  }
  assert.equal(players[0].state.composed, null);
  const york = players.find((p) => p.state.role === 'york');
  const target = york.state.owners.findIndex((owner) => owner !== null && owner !== york.state.you);
  york.send('knowledge:action', { type: 'stealth', index: target, value: '悪' });
  york.send('knowledge:action', { type: 'stealth', index: target, value: '再' });
  assert.equal(york.errors.length, 1);
  t.mock.timers.tick(60000);
  assert.equal(players[0].state.phase, 'answer');
  assert.equal(players[0].state.composed[target], '悪');
  players[1].send('knowledge:action', { type: 'answer', answer: 'お題' });
  assert.equal(players[1].errors.length, 1);
  players[0].send('knowledge:action', { type: 'answer', answer: '不正解' });
  assert.equal(players[0].state.phase, 'discussion');
  players[0].send('knowledge:action', { type: 'vote', target: york.state.you });
  assert.equal(players[0].state.winner, 'stella');
  assert.equal(players[0].state.roles, undefined);
  assert.equal(players[0].state.role[york.state.you], 'york');
  assert.equal(players[0].state.drafts.length, 4);
});

test('battle mode enforces turns and advances with an automatic hint on timeout', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { join } = harness('vivre', 2);
  const [a, b] = [join(0), join(1)];
  a.send('knowledge:action', { type: 'start', settings: { mode: 'battle-hard' } });
  assert.equal(a.state.history.length, 1);
  assert.equal(a.state.answer, null);
  b.send('knowledge:action', { type: 'guess', name: 'A' });
  assert.equal(b.errors.length, 1);
  t.mock.timers.tick(60000);
  assert.equal(a.state.turn, 1);
  assert.equal(a.state.history.length, 2);
  assert.equal(b.state.history.length, 2);
});

test('party mode accepts concurrent players and records only the first correct answer', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { join } = harness('vivre', 3);
  const players = [0, 1, 2].map(join);
  players[0].send('knowledge:action', { type: 'start', settings: { mode: 'party-normal' } });
  assert.equal(players[0].state.deadline, null);
  for (const profile of profiles) {
    const player = players.find((p) => p.state.phase === 'playing');
    if (!player) break;
    if (!player.state.history.some((entry) => entry.profile.name === profile.name)) {
      player.send('knowledge:action', { type: 'guess', name: profile.name });
    }
  }
  assert.equal(players[2].state.phase, 'result');
  const winner = players[2].state.winner;
  const length = players[2].state.history.length;
  players[2].send('knowledge:action', { type: 'guess', name: players[2].state.answer });
  assert.equal(players[2].state.winner, winner);
  assert.equal(players[2].state.history.length, length);
});
