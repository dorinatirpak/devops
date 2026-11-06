import Leaderboard from './Leaderboard';
import RecentMatches from './RecentMatches';

export default function HomeScreen({ onNewGame, refreshKey }) {
  return (
    <div className="home">
      <section className="hero" aria-label="Start">
        <button type="button" className="btn btn--primary btn--lg" onClick={onNewGame}>
          New Game
        </button>
        <details className="rules">
          <summary>How to play</summary>
          <ul>
            <li>Take turns placing your mark on the 15 × 15 board. X always starts.</li>
            <li>Get five in a row horizontally, vertically or diagonally to win.</li>
            <li>Play a friend on the same screen, or challenge the Neon AI.</li>
            <li>Every finished match is saved to the leaderboard under your name.</li>
          </ul>
        </details>
      </section>

      <div className="home__panels">
        <Leaderboard refreshKey={refreshKey} />
        <RecentMatches refreshKey={refreshKey} />
      </div>
    </div>
  );
}
