import { useCallback, useEffect, useRef, useState } from 'react';
import Board from './Board';
import Leaderboard from './Leaderboard';
import TurnIndicator from './TurnIndicator';
import { createBoard, checkWinner, isDraw, chooseAiMove, other } from '../game/logic';
import { saveMatch } from '../api';

const AI_DELAY_MS = 350;

/** One match between two named players. Remounted (via key) for every new game. */
export default function GameScreen({ mode, players, refreshKey, onSaved, onRematch, onHome }) {
  const [board, setBoard] = useState(createBoard);
  const [current, setCurrent] = useState('X');
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
    saveMatch({ playerX: players.X, playerO: players.O, mode, winner: result.winner, moves })
      .then(onSaved)
      .catch(() => setSaveError(true));
  }, [result, players, mode, moves, onSaved]);

  const aiThinking = mode === 'pve' && current === 'O' && !result;

  return (
    <div className="layout">
      <section className="panel controls" aria-label="Match">
        <TurnIndicator players={players} current={current} result={result} aiThinking={aiThinking} />
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

      <Board board={board} onCellClick={play} winningLine={result?.line} disabled={Boolean(result) || aiThinking} />

      <Leaderboard refreshKey={refreshKey} />
    </div>
  );
}
