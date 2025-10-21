import React from 'react';

export interface WaitCountdownProps {
  seconds: number;
  status?: 'inProgress' | 'executing' | 'complete' | string;
  isLight: boolean;
}

export const WaitCountdown: React.FC<WaitCountdownProps> = ({ seconds, status, isLight }) => {
  const [remaining, setRemaining] = React.useState(Math.max(0, Math.min(30, Math.floor(Number(seconds) || 0))));

  React.useEffect(() => {
    const total = Math.max(0, Math.min(30, Math.floor(Number(seconds) || 0)));
    const start = Date.now();
    setRemaining(total);
    const tick = () => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const left = Math.max(0, total - elapsed);
      setRemaining(left);
      if (left <= 0) clearInterval(intervalId);
    };
    const intervalId = window.setInterval(tick, 250);
    tick();
    return () => clearInterval(intervalId);
  }, [seconds]);

  const done = status === 'complete' || remaining <= 0;
  const text = done
    ? `Finished waiting ${Math.max(0, Math.min(30, Math.floor(Number(seconds) || 0)))}s`
    : `Waiting ${remaining}s…`;

  return (
    <div
      className={isLight ? 'text-gray-600' : 'text-gray-500'}
      style={{ padding: 6, fontSize: 12 }}
      aria-live="polite">
      {done ? (
        <span>{text}</span>
      ) : (
        <span className="copilot-action-sparkle-text">
          <span className="sparkle-base">{text}</span>
          <span className="sparkle-overlay" aria-hidden>
            {text}
          </span>
        </span>
      )}
    </div>
  );
};

export default WaitCountdown;
