// Welcome page: opens once in a new tab right after install. "Turn on tot" is
// the one-time OK to check Claude messages (core/consent.ts). Groups live in
// the toolbar popup; this page only points there.

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ENABLED_KEY, isEnabled, setEnabled } from '../../core/consent';
import { COPY } from '../../ui/copy';
import { Bulb, Logo } from '../../ui/trainArt';
import '../../ui/train.css';

const W = COPY.welcome;

function Welcome() {
  const [on, setOn] = useState<boolean | null>(null);

  useEffect(() => {
    void isEnabled().then(setOn);
    const onChange = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && ENABLED_KEY in changes) void isEnabled().then(setOn);
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, []);

  return (
    <div className="wl">
      <div className="wl-inner">
        <header className="wl-head">
          <Logo size={32} />
          <span>{COPY.train.brand}</span>
        </header>
        <section className="wl-hero">
          <h1>{W.title}</h1>
          <p>{W.lead}</p>
        </section>
        <section className="wl-steps" aria-label={W.howLabel}>
          {W.steps.map((step, i) => (
            <div key={step.title} className="wl-step">
              <span>{i + 1}</span>
              <h2>{step.title}</h2>
              <p>{step.body}</p>
            </div>
          ))}
        </section>
        <section className="wl-consent">
          <div>
            <h2>{W.consentTitle}</h2>
            <p>{W.consentBody}</p>
          </div>
          <div className="wl-actions">
            {on ? (
              <>
                <a className="tp-btn is-primary wl-link" href="https://claude.ai/new">
                  {W.openClaude}
                </a>
                <p className="wl-on" role="status">
                  {W.on}. {W.onNote}{' '}
                  <button type="button" className="wl-off" onClick={() => void setEnabled(false)}>
                    {W.turnOff}
                  </button>
                </p>
              </>
            ) : (
              <button type="button" className="tp-btn is-primary" disabled={on === null} onClick={() => void setEnabled(true)}>
                {W.turnOn}
              </button>
            )}
          </div>
        </section>
        <section className="wl-friends">
          <Bulb initials="" color="var(--line)" lit={false} size={44} />
          <p>{W.friends}</p>
        </section>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Welcome />);
