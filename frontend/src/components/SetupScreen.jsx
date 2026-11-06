import { useState } from 'react';
import { AI_NAME, NAME_MAX, cleanName, validatePlayers } from '../game/names';

const MODES = [
  { id: 'pvp', label: 'Player vs Player', hint: 'Two players, one screen' },
  { id: 'pve', label: 'Player vs AI', hint: `Face the ${AI_NAME}` },
];

export default function SetupScreen({ initial, onStart, onBack }) {
  const [mode, setMode] = useState(initial.mode);
  const [names, setNames] = useState(initial.names);
  const [submitted, setSubmitted] = useState(false);

  const errors = validatePlayers(mode, names);
  const show = (p) => submitted && errors[p];

  const submit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (errors.X || errors.O) return;
    onStart(mode, { X: cleanName(names.X), O: mode === 'pve' ? AI_NAME : cleanName(names.O) });
  };

  const field = (p, label) => (
    <div className="field">
      <label htmlFor={`player${p}`} className={`field__label field__label--${p.toLowerCase()}`}>
        {label}
      </label>
      <input
        id={`player${p}`}
        name={`player${p}`}
        value={mode === 'pve' && p === 'O' ? AI_NAME : names[p]}
        maxLength={NAME_MAX}
        autoComplete="off"
        placeholder={p === 'X' ? 'Your name' : "Opponent's name"}
        disabled={mode === 'pve' && p === 'O'}
        aria-invalid={Boolean(show(p))}
        aria-describedby={show(p) ? `err-${p}` : undefined}
        onChange={(e) => setNames((n) => ({ ...n, [p]: e.target.value }))}
      />
      {show(p) && (
        <span id={`err-${p}`} className="field__error">
          {errors[p]}
        </span>
      )}
    </div>
  );

  return (
    <form className="panel setup" onSubmit={submit} noValidate aria-labelledby="setup-title">
      <h2 id="setup-title" className="panel__title">New Game</h2>

      <fieldset className="mode-picker">
        <legend className="field__label">Mode</legend>
        {MODES.map((m) => (
          <label key={m.id} className={`mode-card ${mode === m.id ? 'mode-card--active' : ''}`}>
            <input
              type="radio"
              name="mode"
              value={m.id}
              checked={mode === m.id}
              onChange={() => setMode(m.id)}
            />
            <span className="mode-card__label">{m.label}</span>
            <span className="mode-card__hint">{m.hint}</span>
          </label>
        ))}
      </fieldset>

      {field('X', 'Player X')}
      {field('O', 'Player O')}

      <div className="setup__actions">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          Back
        </button>
        <button type="submit" className="btn btn--primary">
          Start
        </button>
      </div>
    </form>
  );
}
