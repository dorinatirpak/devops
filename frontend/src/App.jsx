import { useCallback, useEffect, useState } from 'react';
import HomeScreen from './components/HomeScreen';
import OnlineScreen from './components/OnlineScreen';
import AiGameScreen from './components/AiGameScreen';
import { fetchHealth } from './api';

export const APP_NAME = 'Neon Requiem';
export { AI_NAME } from './game/names';

// Earlier versions saved the player's name in the browser. The name is no longer
// stored anywhere on the device; this removes a name left over from those versions.
const OLD_NAME_KEY = 'neon-requiem:name';
const forgetOldName = () => {
  try {
    localStorage.removeItem(OLD_NAME_KEY);
  } catch {
    /* storage unavailable (e.g. private mode): nothing to remove */
  }
};

export default function App() {
  const [screen, setScreen] = useState('home'); // 'home' | 'online' | 'ai'
  // Kept only in memory: survives going Home within this visit, gone after a reload.
  const [name, setName] = useState('');

  useEffect(forgetOldName, []);
  const [round, setRound] = useState(0); // new key = fresh game / fresh search
  const [refreshKey, setRefreshKey] = useState(0);
  const [version, setVersion] = useState(null);

  useEffect(() => {
    fetchHealth().then((h) => setVersion(h.version)).catch(() => setVersion(null));
  }, []);

  const play = (mode, playerName) => {
    setName(playerName);
    setRound((r) => r + 1);
    setScreen(mode);
  };
  const again = () => setRound((r) => r + 1);
  const home = () => setScreen('home');
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
        {screen === 'home' && <HomeScreen initialName={name} onPlay={play} refreshKey={refreshKey} />}
        {screen === 'online' && (
          <OnlineScreen key={round} name={name} refreshKey={refreshKey} onSaved={onSaved} onAgain={again} onHome={home} />
        )}
        {screen === 'ai' && (
          <AiGameScreen key={round} name={name} refreshKey={refreshKey} onSaved={onSaved} onRematch={again} onHome={home} />
        )}
      </main>

      <footer className="footer">{version ? `build ${version.slice(0, 7)}` : 'backend offline'}</footer>
    </div>
  );
}
