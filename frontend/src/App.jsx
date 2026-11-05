import { useCallback, useEffect, useRef, useState } from 'react';
import Board from './components/Board';
import Leaderboard from './components/Leaderboard';
import { createBoard, checkWinner, isDraw, chooseAiMove, other } from './game/logic';
import { saveMatch, fetchHealth } from './api';

export const AI_NAME = 'Neon AI';
const AI_DELAY_MS = 350;

export default function App() {
  const [mode, setMode] = useState('pvp');
  const [names, setNames] = useState({ X: 'Player X', O: 'Player O' });
  const [board, setBoard] = useState(createBoard);
  const [current, setCurrent] = useState('X');
  const [result, setResult] = useState(null); // { winner: 'X'|'O'|'draw', line }
  const [refreshKey, setRefreshKey] = useState(0);
  const [version, setVersion] = useState(null);
  const saved = useRef(false);

  const playerO = mode === 'pve' ? AI_NAME : names.O;
  const moves = board.filter(Boolean).length;

  useEffect(() => {
    fetchHealth().then((h) => setVersion(h.version)).catch(() => setVersion(null));
  }, []);

  const play = useCallback(
    (index) => {
      if (result || board[index] !== null) return;
      const next = board.slice();
      next[index] = current;
      setBoard(next);
      const win = checkWinner(next);
      if (win) setResult(win);
      else if (isDraw(next)) setResult({ winner: 'draw', line: [] });
      else setCurrent(other(current));
    },
    [board, current, result],
  );

  // PvE: the AI plays O after a short "thinking" delay.
  useEffect(() => {
    if (mode !== 'pve' || current !== 'O' || result) return undefined;
    const t = setTimeout(() => play(chooseAiMove(board, 'O')), AI_DELAY_MS);
    return () => clearTimeout(t);
  }, [mode, current, result, board, play]);

  // Persist the finished match exactly once.
  useEffect(() => {
    if (!result || saved.current) return;
    saved.current = true;
    saveMatch({ playerX: names.X.trim() || 'Player X', playerO: playerO.trim() || 'Player O', mode, winner: result.winner, moves })
      .then(() => setRefreshKey((k) => k + 1))
      .catch(() => {});
  }, [result, names.X, playerO, mode, moves]);

  const reset = (nextMode = mode) => {
    setMode(nextMode);
    setBoard(createBoard());
    setCurrent('X');
    setResult(null);
    saved.current = false;
  };

  const nameOf = (p) => (p === 'X' ? names.X : playerO);
  let status;
  if (result?.winner === 'draw') status = 'Draw. The night is undecided.';
  else if (result) status = `${nameOf(result.winner)} (${result.winner}) wins!`;
  else status = `${nameOf(current)} (${current}) to move`;

  const inGame = moves > 0 && !result;

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">Neon Gothic Amőba</h1>
        <p className="subtitle">Five in a row. No mercy.</p>
      </header>

      <main className="layout">
        <section className="panel controls" aria-label="Game settings">
          <div className="modes" role="group" aria-label="Game mode">
            <button
              type="button"
              className={`btn ${mode === 'pvp' ? 'btn--active' : ''}`}
              aria-pressed={mode === 'pvp'}
              onClick={() => reset('pvp')}
            >
              PvP
            </button>
            <button
              type="button"
              className={`btn ${mode === 'pve' ? 'btn--active' : ''}`}
              aria-pressed={mode === 'pve'}
              onClick={() => reset('pve')}
            >
              PvE
            </button>
          </div>

          <label className="field">
            <span className="field__label field__label--x">Player X</span>
            <input
              value={names.X}
              maxLength={32}
              disabled={inGame}
              onChange={(e) => setNames((n) => ({ ...n, X: e.target.value }))}
            />
          </label>
          <label className="field">
            <span className="field__label field__label--o">Player O</span>
            <input
              value={playerO}
              maxLength={32}
              disabled={inGame || mode === 'pve'}
              onChange={(e) => setNames((n) => ({ ...n, O: e.target.value }))}
            />
          </label>

          <p className={`status ${result ? 'status--done' : ''}`} role="status" aria-live="polite">
            {status}
          </p>
          <button type="button" className="btn btn--ghost" onClick={() => reset()}>
            New game
          </button>
        </section>

        <Board
          board={board}
          onCellClick={play}
          winningLine={result?.line}
          disabled={Boolean(result) || (mode === 'pve' && current === 'O')}
        />

        <Leaderboard refreshKey={refreshKey} />
      </main>

      <footer className="footer">
        {version ? `build ${version.slice(0, 7)}` : 'backend offline'}
      </footer>
    </div>
  );
}
