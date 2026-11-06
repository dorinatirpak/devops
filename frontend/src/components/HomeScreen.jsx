import { useState } from 'react';
import Leaderboard from './Leaderboard';
import RecentMatches from './RecentMatches';
import { AI_NAME, NAME_MAX, cleanName, nameError } from '../game/names';

export default function HomeScreen({ initialName = '', onPlay, refreshKey }) {
  const [name, setName] = useState(initialName);
  const [submitted, setSubmitted] = useState(false);
  const error = submitted ? nameError(name) : null;

  const play = (mode) => {
    setSubmitted(true);
    if (nameError(name)) return;
    onPlay(mode, cleanName(name));
  };

  return (
    <div className="home">
      <form
        className="hero"
        aria-label="Start"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          play('online');
        }}
      >
        <div className="field hero__field">
          <label htmlFor="playerName" className="field__label">
            Your name
          </label>
          <input
            id="playerName"
            name="playerName"
            value={name}
            maxLength={NAME_MAX}
            autoComplete="nickname"
            placeholder="How the leaderboard will know you"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'playerName-error' : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          {error && (
            <span id="playerName-error" className="field__error">
              {error}
            </span>
          )}
        </div>

        <div className="hero__actions">
          <button type="submit" className="btn btn--primary btn--lg">
            Find Opponent
          </button>
          <button type="button" className="btn btn--ghost btn--lg" onClick={() => play('ai')}>
            Play vs AI
          </button>
        </div>

        <details className="rules">
          <summary>How to play</summary>
          <ul>
            <li>Take turns placing your mark on the 15 × 15 board. X always starts.</li>
            <li>Get five in a row horizontally, vertically or diagonally to win.</li>
            <li>
              <strong>Find Opponent</strong> pairs you with another player online. Each player joins from their own
              device with their own name.
            </li>
            <li>
              <strong>Play vs AI</strong> starts a game against the {AI_NAME} right away.
            </li>
            <li>Every finished match is saved to the leaderboard. Leaving a running online game counts as a loss.</li>
          </ul>
        </details>
      </form>

      <div className="home__panels">
        <Leaderboard refreshKey={refreshKey} />
        <RecentMatches refreshKey={refreshKey} />
      </div>
    </div>
  );
}
