/**
 * UNIT TESTS – online matchmaking (bottom of the Testing Pyramid)
 *
 * The Lobby class is the server-side "referee" of online games: it pairs
 * players, enforces the rules and decides who won. Instead of real WebSockets
 * the tests use fake connections that just record the messages they receive,
 * so the logic is tested on its own, in milliseconds.
 */
import { describe, it, expect, vi } from 'vitest';
import { Lobby } from '../../src/lobby.js';

// A fake connection records everything the lobby sends to it.
const conn = () => {
  const c = { messages: [], send: (m) => c.messages.push(m) };
  c.last = (type) => [...c.messages].reverse().find((m) => m.type === type);
  return c;
};
const flush = () => new Promise((r) => setTimeout(r, 0));

// random() = 0 -> the first player in the queue gets X.
function pairUp(onFinish = vi.fn()) {
  const lobby = new Lobby({ onFinish, random: () => 0 });
  const a = conn();
  const b = conn();
  lobby.join(a, 'Dorina');
  lobby.join(b, 'Bence');
  return { lobby, a, b, onFinish };
}

describe('Lobby matchmaking (unit)', () => {
  // WHAT: the first player waits in the queue; the second player is paired with
  // them, and both receive their mark (X/O) and the names of both players.
  // WHY: this is matchmaking itself. If it breaks, nobody can play online.
  it('queues the first player and pairs them with the next one', () => {
    const lobby = new Lobby({ random: () => 0 });
    const a = conn();
    lobby.join(a, '  Dorina ');
    expect(a.last('queued')).toEqual({ type: 'queued', name: 'Dorina' });
    expect(a.last('start')).toBeUndefined();

    const b = conn();
    lobby.join(b, 'Bence');
    const players = { X: 'Dorina', O: 'Bence' };
    expect(a.last('start')).toMatchObject({ you: 'X', players });
    expect(b.last('start')).toMatchObject({ you: 'O', players });
    expect(lobby.stats).toEqual({ waiting: 0, playing: 2 });
  });

  // WHAT: a name already in the queue (even in different capitals) is rejected,
  // generic names such as "Player X" are rejected, and cancelling the search frees
  // the name again.
  // WHY (security rule): one person must not be able to join twice and play
  // against themselves to farm wins on the leaderboard.
  it('gives one seat per name, so nobody can play against themselves', () => {
    const lobby = new Lobby();
    const a = conn();
    const b = conn();
    lobby.join(a, 'Dorina');
    lobby.join(b, 'dorina'); // same person, different case
    expect(b.last('error')).toMatchObject({ code: 'name_taken' });
    expect(a.last('start')).toBeUndefined();

    lobby.join(b, 'Player X'); // generic names would merge leaderboard rows
    expect(b.last('error')).toMatchObject({ code: 'bad_name' });

    lobby.leave(a); // cancelling the search frees the name again
    lobby.join(b, 'Dorina');
    expect(b.last('queued')).toBeDefined();
  });

  // WHAT: the server refuses a move when it is not your turn, when the cell is
  // already taken, or when the cell does not exist.
  // WHY (security rule): the browser cannot be trusted. Even a modified client
  // cannot cheat, because every move is checked here, on the server.
  it('rejects moves out of turn, on taken cells and off the board', () => {
    const { lobby, a, b } = pairUp();
    lobby.move(b, 0);
    expect(b.last('error')).toMatchObject({ code: 'bad_move', message: 'Not your turn' });

    lobby.move(a, 0);
    expect(b.last('move')).toEqual({ type: 'move', index: 0, mark: 'X', next: 'O' });
    lobby.move(b, 0);
    expect(b.last('error')).toMatchObject({ message: 'Cell already taken' });
    lobby.move(b, 999);
    expect(b.last('error')).toMatchObject({ message: 'No such cell' });
  });

  // WHAT: after five in a row the server announces the winner to BOTH players,
  // saves the match (onFinish) and releases the players so they can search again.
  // No more moves are accepted after the game is over.
  // WHY: the result is decided and stored by the server, never by a browser.
  it('decides the winner on the server, records the match and frees both players', async () => {
    const { lobby, a, b, onFinish } = pairUp();
    for (let c = 0; c < 4; c++) {
      lobby.move(a, c); // X on row 0
      lobby.move(b, 15 + c); // O on row 1
    }
    lobby.move(a, 4);

    const end = { type: 'end', winner: 'X', line: [0, 1, 2, 3, 4], reason: 'five' };
    expect(a.last('end')).toEqual(end);
    expect(b.last('end')).toEqual(end);
    expect(onFinish).toHaveBeenCalledWith({ playerX: 'Dorina', playerO: 'Bence', mode: 'pvp', winner: 'X', moves: 9 });
    await flush();
    expect(a.last('saved')).toBeDefined();
    expect(lobby.stats).toEqual({ waiting: 0, playing: 0 });

    lobby.move(b, 50); // the game is over: no more moves
    expect(b.last('error')).toMatchObject({ code: 'bad_move' });
  });

  // WHAT: leaving after the first move is a forfeit (the opponent wins and it is
  // saved); leaving before any move just cancels the game without a record.
  // WHY (edge case): rage-quitting must not protect your record, but an
  // accidental disconnect right after pairing should not cost a loss.
  it('counts leaving a running game as a loss, but not before the first move', () => {
    const early = pairUp();
    early.lobby.leave(early.b);
    expect(early.a.last('end')).toMatchObject({ winner: 'X', reason: 'forfeit' });
    expect(early.onFinish).not.toHaveBeenCalled();

    const late = pairUp();
    late.lobby.move(late.a, 112);
    late.lobby.leave(late.a);
    expect(late.b.last('end')).toMatchObject({ winner: 'O', reason: 'forfeit' });
    expect(late.onFinish).toHaveBeenCalledWith(expect.objectContaining({ winner: 'O', moves: 1 }));
  });
});
