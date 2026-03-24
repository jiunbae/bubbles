import './bubble-loader.css';

interface BubbleLoaderProps {
  /** Optional text to display below the bubbles */
  label?: string;
}

export function BubbleLoader({ label }: BubbleLoaderProps) {
  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-label={label ?? 'Loading'}>
      <div className="bubble-loader" aria-hidden="true">
        <span className="bubble-loader__dot" />
        <span className="bubble-loader__dot" />
        <span className="bubble-loader__dot" />
      </div>
      {label && <span className="text-sm text-text-secondary">{label}</span>}
    </div>
  );
}
