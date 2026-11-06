import { createBoard, checkWinner, isFull, other, SIZE } from './game.js';
import { nameError } from './validation.js';

const cleanName = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
const key = (name) => name.toLowerCase();

/**
 * Online matchmaking + authoritative game state.
 *
 * Transport-agnostic: a "connection" is any object with send(message).
 * The WebSocket layer (ws.js) wraps real sockets; unit tests pass fakes.
 *
 * Protocol (client -> server):  {type:'join', name} | {type:'move', index} | {type:'leave'}
 * Protocol (server -> client):  queued | start | move | end | error
 */
export class Lobby {
  /**
   * @param {object} opts
   * @param {(match) => Promise|void} opts.onFinish  persists a finished match
   * @param {() => number} opts.random              injectable for deterministic tests
   */
  constructor({ onFinish = () => {}, random = Math.random } = {}) {
    this.onFinish = onFinish;
    this.random = random;
    this.queue = []; // connections waiting for an opponent
    this.players = new Map(); // conn -> { name, game, mark }
    this.nextGameId = 1;
  }

  get stats() {
    return { waiting: this.queue.length, playing: this.players.size - this.queue.length };
  }

  handle(conn, message) {
    switch (message?.type) {
      case 'join':
        return this.join(conn, message.name);
      case 'move':
        return this.move(conn, message.index);
      case 'leave':
        return this.leave(conn);
      default:
        return conn.send({ type: 'error', code: 'bad_message', message: 'Unknown message type' });
    }
  }

  join(conn, rawName) {
    if (this.players.has(conn)) {
      return conn.send({ type: 'error', code: 'already_joined', message: 'You are already in the lobby' });
    }
    const name = cleanName(rawName);
    const err = nameError(name, 'Name');
    if (err) return conn.send({ type: 'error', code: 'bad_name', message: err });
    // One name = one seat. Stops the same player from queueing twice and meeting themselves.
    for (const p of this.players.values()) {
      if (key(p.name) === key(name)) {
        return conn.send({ type: 'error', code: 'name_taken', message: `${name} is already playing online` });
      }
    }

    this.players.set(conn, { name, game: null, mark: null });
    this.queue.push(conn);
    conn.send({ type: 'queued', name });
    this.pair();
  }

  pair() {
    while (this.queue.length >= 2) {
      const a = this.queue.shift();
      const b = this.queue.shift();
      const [x, o] = this.random() < 0.5 ? [a, b] : [b, a];
      const game = {
        id: this.nextGameId++,
        conns: { X: x, O: o },
        names: { X: this.players.get(x).name, O: this.players.get(o).name },
        board: createBoard(),
        current: 'X',
        moves: 0,
        over: false,
      };
      for (const mark of ['X', 'O']) {
        Object.assign(this.players.get(game.conns[mark]), { game, mark });
        game.conns[mark].send({ type: 'start', gameId: game.id, you: mark, players: game.names });
      }
    }
  }

  move(conn, index) {
    const p = this.players.get(conn);
    const game = p?.game;
    const reject = (message) => conn.send({ type: 'error', code: 'bad_move', message });
    if (!game || game.over) return reject('You are not in a running game');
    if (game.current !== p.mark) return reject('Not your turn');
    if (!Number.isInteger(index) || index < 0 || index >= SIZE * SIZE) return reject('No such cell');
    if (game.board[index] !== null) return reject('Cell already taken');

    game.board[index] = p.mark;
    game.moves++;
    game.current = other(p.mark);
    this.broadcast(game, { type: 'move', index, mark: p.mark, next: game.current });

    const win = checkWinner(game.board);
    if (win) return this.finish(game, win.winner, win.line, 'five');
    if (isFull(game.board)) return this.finish(game, 'draw', [], 'draw');
    return undefined;
  }

  /** Socket closed or player pressed Leave: free the name, forfeit a running game. */
  leave(conn) {
    const p = this.players.get(conn);
    if (!p) return;
    this.queue = this.queue.filter((c) => c !== conn);
    if (p.game && !p.game.over) {
      // Leaving after the first move counts as a loss, so rage-quitting doesn't save your record.
      this.finish(p.game, other(p.mark), [], 'forfeit', { record: p.game.moves > 0 });
    }
    this.players.delete(conn);
  }

  finish(game, winner, line, reason, { record = true } = {}) {
    game.over = true;
    this.broadcast(game, { type: 'end', winner, line, reason });
    // Players go back to "idle": the same connection may join the queue again.
    for (const c of Object.values(game.conns)) this.players.delete(c);

    if (!record) return;
    const match = { playerX: game.names.X, playerO: game.names.O, mode: 'pvp', winner, moves: game.moves };
    Promise.resolve(this.onFinish(match))
      .then(() => this.broadcast(game, { type: 'saved' }))
      .catch((err) => {
        console.error('Could not save online match', err);
        this.broadcast(game, { type: 'error', code: 'save_failed', message: 'Could not save this match' });
      });
  }

  broadcast(game, message) {
    for (const c of Object.values(game.conns)) c.send(message);
  }
}
