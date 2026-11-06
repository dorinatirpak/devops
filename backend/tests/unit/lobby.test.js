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
  it('queues the first player and pairs the second', () => {
    const lobby = new Lobby({ random: () => 0 });
    const a = conn();
    lobby.join(a, '  Dorina ');
    expect(a.last('queued')).toEqual({ type: 'queued', name: 'Dorina' });
    expect(lobby.stats).toEqual({ waiting: 1, playing: 0 });

    const b = conn();
    lobby.join(b, 'Bence');
    const players = { X: 'Dorina', O: 'Bence' };
    expect(a.last('start')).toMatchObject({ you: 'X', players });
    expect(b.last('start')).toMatchObject({ you: 'O', players });
    expect(lobby.stats).toEqual({ waiting: 0, playing: 2 });
  });

  it('never lets a name queue twice, so nobody can play against themselves', () => {
    const lobby = new Lobby();
    const a = conn();
    const b = conn();
    lobby.join(a, 'Dorina');
    lobby.join(b, 'dorina');
    expect(b.last('error')).toMatchObject({ code: 'name_taken' });
    expect(a.last('start')).toBeUndefined();
    expect(lobby.stats.waiting).toBe(1);
  });

  it('rejects invalid names', () => {
    const lobby = new Lobby();
    const a = conn();
    lobby.join(a, 'Player X');
    lobby.join(a, 'Neon AI');
    expect(a.messages.filter((m) => m.code === 'bad_name')).toHaveLength(2);
    expect(lobby.stats.waiting).toBe(0);
  });

  it('enforces turns and free cells on the server', () => {
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

  it('detects five in a row, records the match and tells both players', async () => {
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
  });

  it('awards a forfeit win when a player leaves mid-game', () => {
    const { lobby, a, b, onFinish } = pairUp();
    lobby.move(a, 112);
    lobby.leave(a);
    expect(b.last('end')).toMatchObject({ winner: 'O', reason: 'forfeit' });
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ winner: 'O', moves: 1 }));
  });

  it('does not record a game abandoned before the first move', () => {
    const { lobby, a, b, onFinish } = pairUp();
    lobby.leave(b);
    expect(a.last('end')).toMatchObject({ winner: 'X', reason: 'forfeit' });
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('frees the name when a player cancels the search', () => {
    const lobby = new Lobby();
    const a = conn();
    lobby.join(a, 'Dorina');
    lobby.leave(a);
    expect(lobby.stats.waiting).toBe(0);
    const b = conn();
    lobby.join(b, 'Dorina');
    expect(b.last('queued')).toBeDefined();
  });
});
