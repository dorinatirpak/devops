import { useCallback, useEffect, useState } from 'react';
import HomeScreen from './components/HomeScreen';
import SetupScreen from './components/SetupScreen';
import GameScreen from './components/GameScreen';
import { fetchHealth } from './api';

export const APP_NAME = 'Neon Requiem';
export { AI_NAME } from './game/names';

export default function App() {
  const [screen, setScreen] = useState('home'); // 'home' | 'setup' | 'game'
  // Last used settings: prefilled when starting another game in this session.
  const [setup, setSetup] = useState({ mode: 'pvp', names: { X: '', O: '' } });
  const [game, setGame] = useState(null); // { id, mode, players: { X, O } }
  const [refreshKey, setRefreshKey] = useState(0);
  const [version, setVersion] = useState(null);

  useEffect(() => {
    fetchHealth().then((h) => setVersion(h.version)).catch(() => setVersion(null));
  }, []);

  const start = (mode, players) => {
    setSetup((s) => ({ mode, names: { X: players.X, O: mode === 'pvp' ? players.O : s.names.O } }));
    setGame({ id: Date.now(), mode, players });
    setScreen('game');
  };
  const onSaved = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">{APP_NAME}</h1>
        <div className="ornament" aria-hidden="true">
          <span className="ornament__line" />
          <span className="ornament__gem" />
          <span className="ornament__line" />
        </div>
      </header>

      <main>
        {screen === 'home' && <HomeScreen onNewGame={() => setScreen('setup')} refreshKey={refreshKey} />}
        {screen === 'setup' && (
          <SetupScreen initial={setup} onStart={start} onBack={() => setScreen('home')} />
        )}
        {screen === 'game' && game && (
          <GameScreen
            key={game.id}
            mode={game.mode}
            players={game.players}
            refreshKey={refreshKey}
            onSaved={onSaved}
            onRematch={() => setGame((g) => ({ ...g, id: Date.now() }))}
            onHome={() => setScreen('home')}
          />
        )}
      </main>

      <footer className="footer">{version ? `build ${version.slice(0, 7)}` : 'backend offline'}</footer>
    </div>
  );
}
