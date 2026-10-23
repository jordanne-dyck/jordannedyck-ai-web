'use client';

import { useEffect, useRef, useState } from 'react';
import { FilmEffects } from '@/app/components/FilmEffects';

// The film layers plus the pause control (WCAG 2.2.2), as on the home page.
// The rest of /about stays server-rendered, so the button marks the page root
// paused itself instead of the root owning the state.
export function AboutMotion() {
  const [paused, setPaused] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    buttonRef.current?.closest('.home')?.toggleAttribute('data-paused', paused);
  }, [paused]);

  return (
    <>
      <button ref={buttonRef} type="button" className="label pause" aria-pressed={paused} onClick={() => setPaused(p => !p)}>
        {paused ? 'Play motion' : 'Pause motion'}
      </button>
      <FilmEffects paused={paused} />
    </>
  );
}
