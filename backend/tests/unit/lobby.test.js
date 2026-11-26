/**
 * ============================================================================
 *  UNIT TESTS – online matchmaking               Testing Pyramid level: 1 (base)
 * ============================================================================
 *  Type:     Unit test (Vitest)
 *  Tests:    backend/src/lobby.js – the Lobby class, the server-side "referee"
 *            of online games. It
 *              - queues players and pairs them (matchmaking)
 *              - allows only one seat per name
 *              - checks every move (turn order, free cell, valid cell)
 *              - decides the winner and asks for the match to be saved
 *              - handles players who leave (forfeit)
 *  Fakes:    the network. Instead of real WebSockets, conn() creates a fake
 *            "connection" that simply records every message the Lobby sends
 *            to it. Saving to the database (onFinish) is a spy function.
 *  Needs:    nothing (no server, no database)
 *  Speed:    milliseconds
 *  Run:      cd backend  ->  npm test
 * ============================================================================
 */
import { describe, it, expect, vi } from 'vitest';
import { Lobby } from '../../src/lobby.js';

// Fake connection: c.messages collects everything the Lobby sends;
// c.last('start') returns the most recent message of that type.
const conn = () => {
  const c = { messages: [], send: (m) => c.messages.push(m) };
  c.last = (type) => [...c.messages].reverse().find((m) => m.type === type);
  return c;
};
// Lets asynchronous work (saving the match) finish before we check the result.
const flush = () => new Promise((r) => setTimeout(r, 0));

// Shortcut used by several tests: creates a Lobby and two paired players.
// random() = 0 makes the colour choice predictable: the first player gets X.
// onFinish is a spy (vi.fn) so we can check what would be saved to the database.
function pairUp(onFinish = vi.fn()) {
  const lobby = new Lobby({ onFinish, random: () => 0 });
  const a = conn();
  const b = conn();
  lobby.join(a, 'Dorina'); // a = X
  lobby.join(b, 'Bence'); // b = O
  return { lobby, a, b, onFinish };
}

describe('Lobby matchmaking (unit)', () => {
  // --------------------------------------------------------------------------
  // TEST 1 – Matchmaking (business logic)
  // Checks:
  //   1. the first player is put in the queue, and spaces around the name are trimmed
  //   2. a single player is NOT paired with anyone
  //   3. when a second player joins, the two are paired
  //   4. both players learn their own mark (X/O) and both names
  //   5. the lobby statistics show 0 waiting, 2 playing
  // --------------------------------------------------------------------------
  it('queues the first player and pairs them with the next one', () => {
    const lobby = new Lobby({ random: () => 0 });
    const a = conn();
    lobby.join(a, '  Dorina '); // extra spaces on purpose
    expect(a.last('queued')).toEqual({ type: 'queued', name: 'Dorina' }); // 1. queued, name cleaned
    expect(a.last('start')).toBeUndefined(); // 2. alone -> no game yet

    const b = conn();
    lobby.join(b, 'Bence'); // 3. second player arrives
    const players = { X: 'Dorina', O: 'Bence' };
    expect(a.last('start')).toMatchObject({ you: 'X', players }); // 4. Dorina plays X
    expect(b.last('start')).toMatchObject({ you: 'O', players }); //    Bence plays O
    expect(lobby.stats).toEqual({ waiting: 0, playing: 2 }); // 5. nobody left waiting
  });

  // --------------------------------------------------------------------------
  // TEST 2 – One seat per name (security rule)
  // Checks:
  //   1. a name that is already in the queue is refused, even with different
  //      capital letters ("dorina" vs "Dorina")
  //   2. the two connections are NOT paired with each other -> no self-play
  //   3. generic names like "Player X" are refused (they would merge
  //      different people into one leaderboard row)
  //   4. after the first player cancels, the name can be used again
  // --------------------------------------------------------------------------
  it('gives one seat per name, so nobody can play against themselves', () => {
    const lobby = new Lobby();
    const a = conn();
    const b = conn();
    lobby.join(a, 'Dorina');
    lobby.join(b, 'dorina'); // same person, different case
    expect(b.last('error')).toMatchObject({ code: 'name_taken' }); // 1. refused
    expect(a.last('start')).toBeUndefined(); // 2. no game was started

    lobby.join(b, 'Player X'); // generic names would merge leaderboard rows
    expect(b.last('error')).toMatchObject({ code: 'bad_name' }); // 3. refused

    lobby.leave(a); // the first player cancels the search
    lobby.join(b, 'Dorina');
    expect(b.last('queued')).toBeDefined(); // 4. the name is free again
  });

  // --------------------------------------------------------------------------
  // TEST 3 – The server checks every move (security rule)
  // Checks:
  //   1. O cannot move first (X always starts)          -> "Not your turn"
  //   2. a valid move by X is sent to the opponent too, with whose turn is next
  //   3. a cell that is already taken cannot be used    -> "Cell already taken"
  //   4. a cell that does not exist cannot be used      -> "No such cell"
  // Why: the browser cannot be trusted. Even a modified client cannot cheat,
  // because the server validates every move.
  // --------------------------------------------------------------------------
  it('rejects moves out of turn, on taken cells and off the board', () => {
    const { lobby, a, b } = pairUp();
    lobby.move(b, 0); // O tries to move first
    expect(b.last('error')).toMatchObject({ code: 'bad_move', message: 'Not your turn' }); // 1.

    lobby.move(a, 0); // X plays the top-left cell
    expect(b.last('move')).toEqual({ type: 'move', index: 0, mark: 'X', next: 'O' }); // 2. O sees it
    lobby.move(b, 0); // O tries the same cell
    expect(b.last('error')).toMatchObject({ message: 'Cell already taken' }); // 3.
    lobby.move(b, 999); // the board only has cells 0-224
    expect(b.last('error')).toMatchObject({ message: 'No such cell' }); // 4.
  });

  // --------------------------------------------------------------------------
  // TEST 4 – The server decides the winner (business logic + state change)
  // Checks:
  //   1. after five X in a row, BOTH players get the same "end" message with
  //      the winner, the winning cells and the reason
  //   2. the match is handed over for saving with the correct data
  //      (names, mode "pvp", winner, number of moves)
  //   3. both players are told the match was saved
  //   4. both players are released: nobody is waiting or playing any more
  //   5. after the game is over, no further moves are accepted
  // --------------------------------------------------------------------------
  it('decides the winner on the server, records the match and frees both players', async () => {
    const { lobby, a, b, onFinish } = pairUp();
    for (let c = 0; c < 4; c++) {
      lobby.move(a, c); // X on row 0: cells 0, 1, 2, 3
      lobby.move(b, 15 + c); // O on row 1: cells 15, 16, 17, 18
    }
    lobby.move(a, 4); // X completes five: cells 0-4

    const end = { type: 'end', winner: 'X', line: [0, 1, 2, 3, 4], reason: 'five' };
    expect(a.last('end')).toEqual(end); // 1. the winner is told...
    expect(b.last('end')).toEqual(end); //    ...and so is the loser
    // 2. 9 moves in total: X played 5, O played 4.
    expect(onFinish).toHaveBeenCalledWith({ playerX: 'Dorina', playerO: 'Bence', mode: 'pvp', winner: 'X', moves: 9 });
    await flush();
    expect(a.last('saved')).toBeDefined(); // 3. "your match was saved"
    expect(lobby.stats).toEqual({ waiting: 0, playing: 0 }); // 4. both released

    lobby.move(b, 50); // the game is over: no more moves
    expect(b.last('error')).toMatchObject({ code: 'bad_move' }); // 5.
  });

  // --------------------------------------------------------------------------
  // TEST 5 – Leaving a game (edge case)
  // Checks:
  //   1. leaving BEFORE the first move: the opponent is told, but the game is
  //      NOT saved (e.g. an accidental disconnect right after pairing)
  //   2. leaving AFTER a move: it counts as a loss (forfeit), the opponent
  //      wins, and the result IS saved - so rage-quitting doesn't help
  // --------------------------------------------------------------------------
  it('counts leaving a running game as a loss, but not before the first move', () => {
    const early = pairUp();
    early.lobby.leave(early.b); // O leaves before anyone moved
    expect(early.a.last('end')).toMatchObject({ winner: 'X', reason: 'forfeit' }); // 1. X is told
    expect(early.onFinish).not.toHaveBeenCalled(); //    but nothing is saved

    const late = pairUp();
    late.lobby.move(late.a, 112); // X makes a move (centre of the board)
    late.lobby.leave(late.a); // then X leaves
    expect(late.b.last('end')).toMatchObject({ winner: 'O', reason: 'forfeit' }); // 2. O wins
    expect(late.onFinish).toHaveBeenCalledWith(expect.objectContaining({ winner: 'O', moves: 1 })); // and it is saved
  });
});
