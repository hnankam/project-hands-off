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

  // Custom icon for wait action - clock/timer
  const waitIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ 
        flexShrink: 0, 
        marginRight: 6, 
        display: 'inline-block', 
        verticalAlign: 'middle',
        color: isLight ? '#4b5563' : '#6b7280' // gray-600 for light, gray-500 for dark
      }}>
      {/* Clock circle */}
      <circle stroke="currentColor" cx="12" cy="12" r="10" />
      {/* Clock hands */}
      <path stroke="currentColor" d="M12 6v6l4 2" />
    </svg>
  );

  return (
    <div
      className={isLight ? 'text-gray-600' : 'text-gray-500'}
      style={{ 
        paddingTop: 6,
        paddingBottom: 6,
        paddingLeft: 12,
        paddingRight: 12,
        fontSize: 12, 
        display: 'flex', 
        alignItems: 'center',
        maxWidth: '56rem',
        width: '100%',
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
      aria-live="polite">
      {waitIcon}
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
