import { useCallback, useEffect, useRef, useState } from 'react';
import Board from './Board';
import Leaderboard from './Leaderboard';
import TurnIndicator from './TurnIndicator';
import { createBoard, checkWinner, isDraw, chooseAiMove, other } from '../game/logic';
import { AI_NAME } from '../game/names';
import { saveMatch } from '../api';

// The AI picks its move in microseconds. Holding it back for a moment lets the
// turn indicator glide over and the player see where their own stone landed.
export const AI_THINK_MS = 900;

/** You (X) against the Neon AI (O). Remounted (via key) for every new game. */
export default function AiGameScreen({ name, refreshKey, onSaved, onRematch, onHome }) {
  const players = { X: name, O: AI_NAME };
  const [board, setBoard] = useState(createBoard);
  const [current, setCurrent] = useState('X');
  const [lastMove, setLastMove] = useState(null);
  const [result, setResult] = useState(null); // { winner: 'X'|'O'|'draw', line }
  const [saveError, setSaveError] = useState(false);
  const saved = useRef(false);
  const moves = board.filter(Boolean).length;

  const play = useCallback(
    (index) => {
      if (result || board[index] !== null) return;
      const next = board.slice();
      next[index] = current;
      setBoard(next);
      setLastMove(index);
      const win = checkWinner(next);
      if (win) setResult(win);
      else if (isDraw(next)) setResult({ winner: 'draw', line: [] });
      else setCurrent(other(current));
    },
    [board, current, result],
  );

  useEffect(() => {
    if (current !== 'O' || result) return undefined;
    const t = setTimeout(() => play(chooseAiMove(board, 'O')), AI_THINK_MS);
    return () => clearTimeout(t);
  }, [current, result, board, play]);

  // Persist the finished match exactly once.
  useEffect(() => {
    if (!result || saved.current) return;
    saved.current = true;
    saveMatch({ playerX: players.X, playerO: players.O, mode: 'pve', winner: result.winner, moves })
      .then(onSaved)
      .catch(() => setSaveError(true));
  }, [result, players.X, players.O, moves, onSaved]);

  const thinking = current === 'O' && !result;

  return (
    <div className="layout">
      <section className="panel controls" aria-label="Match">
        <TurnIndicator players={players} current={current} result={result} you="X" thinking={thinking} />
        {saveError && <p className="field__error">Could not save this match.</p>}
        <div className="controls__actions">
          <button type="button" className="btn btn--primary" onClick={onRematch}>
            {result ? 'Rematch' : 'Restart'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onHome}>
            Home
          </button>
        </div>
      </section>

      <Board
        board={board}
        onCellClick={play}
        winningLine={result?.line}
        lastMove={lastMove}
        disabled={Boolean(result)}
        waiting={thinking}
      />

      <Leaderboard refreshKey={refreshKey} />
    </div>
  );
}
