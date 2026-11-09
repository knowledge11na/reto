import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupTcgMode } from '../tcgMode.js';
import { STANDARD_DECK } from '../lib/tcgCards.js';

function harness(roomId, expected, tokens = null) {
  const sockets = new Map();
  let connect;
  const io = {
    sockets: { sockets },
    on: (_event, handler) => { connect = handler; },
    to: (id) => ({
      emit: (event, data) => {
        const socket = sockets.get(id);
        if (event === 'tcg:state') socket.state = data;
        if (event === 'tcg:lobby') socket.lobby = data;
      },
    }),
  };
  const tcg = setupTcgMode(io);
  tcg.prepareFreeRoom(roomId, expected, tokens);
  let sequence = 0;
  const join = (clientId, token) => {
    const handlers = {};
    const socket = {
      id: `${clientId}-${++sequence}`,
      data: {},
      errors: [],
      on: (event, handler) => { handlers[event] = handler; },
      emit: (event, data) => { if (event === 'tcg:error') socket.errors.push(data.message); },
      send: (event, data) => handlers[event](data),
    };
    sockets.set(socket.id, socket);
    connect(socket);
    socket.send('tcg:join', { roomId, clientId, name: clientId, token });
    return socket;
  };
  return { join };
}

test('three participants must choose two players and one spectator', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { join } = harness('spectator-test', 3);
  const a = join('a');
  const b = join('b');
  const c = join('c');
  for (const socket of [a, b, c]) socket.send('tcg:select-role', { role: 'player', deck: STANDARD_DECK });
  for (const socket of [a, b, c]) {
    assert.match(socket.lobby.error, /プレイ人数が合いません/);
    assert.equal(socket.lobby.role, null);
    assert.equal(socket.state, undefined);
  }
  a.send('tcg:select-role', { role: 'player', deck: STANDARD_DECK });
  b.send('tcg:select-role', { role: 'spectator' });
  c.send('tcg:select-role', { role: 'spectator' });
  assert.match(a.lobby.error, /プレイ人数が合いません/);
  a.send('tcg:select-role', { role: 'player', deck: STANDARD_DECK });
  b.send('tcg:select-role', { role: 'player', deck: STANDARD_DECK });
  c.send('tcg:select-role', { role: 'spectator' });
  assert.equal(a.state.pending.kind, 'mulligan');
  assert.equal(c.state.spectator, true);
  assert.deepEqual(c.state.me.hand, a.state.me.hand);
  assert.deepEqual(c.state.opp.hand, b.state.me.hand);
  assert.equal(a.state.opp.hand, undefined);
  c.send('tcg:mulligan', { redraw: true });
  c.send('tcg:surrender');
  assert.equal(c.errors.length, 2);
  assert.equal(a.state.pending.kind, 'mulligan');
  assert.equal(a.state.phase, 'playing');
  c.send('disconnect');
  const reconnected = join('c');
  assert.equal(reconnected.state.spectator, true);
  assert.equal(reconnected.state.opp.hand.length, b.state.me.hand.length);
  a.send('tcg:surrender');
});

test('only invited participants can enter a protected room', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { join } = harness('protected-test', 3, ['token-a', 'token-b', 'token-c']);
  const outsider = join('outsider', 'invalid');
  assert.equal(outsider.errors.length, 1);
  const a = join('a', 'token-a');
  const b = join('b', 'token-b');
  const c = join('c', 'token-c');
  assert.equal(a.lobby.joined, 3);
  a.send('tcg:select-role', { role: 'player', deck: STANDARD_DECK });
  b.send('tcg:select-role', { role: 'player', deck: STANDARD_DECK });
  c.send('tcg:select-role', { role: 'spectator' });
  assert.equal(c.state.spectator, true);
  assert.equal(outsider.state, undefined);
  a.send('tcg:surrender');
});

test('two-player room rejects spectator and starts after two deck selections', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { join } = harness('two-player-test', 2);
  const a = join('a');
  const b = join('b');
  a.send('tcg:select-role', { role: 'spectator' });
  assert.equal(a.errors.length, 1);
  a.send('tcg:select-role', { role: 'player', deck: STANDARD_DECK });
  b.send('tcg:select-role', { role: 'player', deck: STANDARD_DECK });
  assert.equal(a.state.pending.kind, 'mulligan');
  assert.equal(b.state.spectator, undefined);
  a.send('tcg:surrender');
});
