import { useEffect, useReducer, useRef } from 'react';
import Board from './Board';
import Leaderboard from './Leaderboard';
import TurnIndicator from './TurnIndicator';
import { createBoard } from '../game/logic';
import { connectLobby } from '../online';

const initial = {
  phase: 'connecting', // connecting | searching | playing | ended | error
  you: null,
  players: null,
  board: createBoard(),
  current: 'X',
  lastMove: null,
  result: null, // { winner, line, reason }
  error: null,
};

// Pure state machine driven by server messages -> easy to reason about and test.
export function reducer(state, msg) {
  switch (msg.type) {
    case 'queued':
      return { ...state, phase: 'searching' };
    case 'start':
      return { ...initial, phase: 'playing', you: msg.you, players: msg.players };
    case 'move': {
      const board = state.board.slice();
      board[msg.index] = msg.mark;
      return { ...state, board, current: msg.next, lastMove: msg.index };
    }
    case 'end':
      return { ...state, phase: 'ended', result: { winner: msg.winner, line: msg.line, reason: msg.reason } };
    case 'error':
      // A rejected move (e.g. a double click) needs no UI; anything before the game starts is fatal.
      if (msg.code === 'bad_move' || state.phase === 'playing' || state.phase === 'ended') return state;
      return { ...state, phase: 'error', error: msg.message };
    case 'closed':
      if (state.phase === 'ended') return state;
      return { ...state, phase: 'error', error: 'Connection to the server was lost.' };
    default:
      return state;
  }
}

/** Online match: matchmaking first, then a server-run game. Remounted (via key) to search again. */
export default function OnlineScreen({ name, refreshKey, onSaved, onAgain, onHome }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const lobby = useRef(null);

  useEffect(() => {
    const conn = connectLobby(name, (msg) => {
      if (msg.type === 'saved') onSaved();
      dispatch(msg);
    });
    lobby.current = conn;
    return () => conn.close(); // leaving the screen = leaving the queue / forfeiting
  }, [name, onSaved]);

  if (state.phase === 'connecting' || state.phase === 'searching' || state.phase === 'error') {
    return (
      <section className="panel searching" aria-labelledby="search-title">
        <h2 id="search-title" className="panel__title">
          {state.phase === 'error' ? 'Matchmaking' : 'Finding an opponent'}
        </h2>
        {state.phase === 'error' ? (
          <p role="alert" className="field__error">{state.error}</p>
        ) : (
          <>
            <div className="radar" aria-hidden="true" />
            <p role="status">{state.phase === 'connecting' ? 'Connecting…' : `Waiting for a challenger, ${name}…`}</p>
            <p className="muted">
              You will be paired with the next player who joins. Playing a friend? Ask them to open the game on their
              own device and press Find Opponent.
            </p>
          </>
        )}
        <div className="setup__actions">
          <button type="button" className="btn btn--ghost" onClick={onHome}>
            {state.phase === 'error' ? 'Back' : 'Cancel'}
          </button>
          {state.phase === 'error' && (
            <button type="button" className="btn btn--primary" onClick={onAgain}>
              Try again
            </button>
          )}
        </div>
      </section>
    );
  }

  const { players, you, board, current, result, lastMove } = state;
  const myTurn = !result && current === you;

  return (
    <div className="layout">
      <section className="panel controls" aria-label="Match">
        <TurnIndicator players={players} current={current} result={result} you={you} />
        <div className="controls__actions">
          {result ? (
            <button type="button" className="btn btn--primary" onClick={onAgain}>
              New opponent
            </button>
          ) : (
            <span className="muted controls__hint">You play {you}</span>
          )}
          <button type="button" className="btn btn--ghost" onClick={onHome}>
            {result ? 'Home' : 'Leave'}
          </button>
        </div>
      </section>

      <Board
        board={board}
        onCellClick={(i) => lobby.current?.move(i)}
        winningLine={result?.line}
        lastMove={lastMove}
        disabled={Boolean(result)}
        waiting={!result && !myTurn}
      />

      <Leaderboard refreshKey={refreshKey} />
    </div>
  );
}
