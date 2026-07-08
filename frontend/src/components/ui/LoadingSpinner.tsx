interface LoadingSpinnerProps {
  /** Size of the spinner in pixels. Default: 40 */
  size?: number;
  /** Optional message to display below the spinner */
  message?: string;
  /** Center the spinner in the full viewport (e.g. auth/route loading) */
  fullscreen?: boolean;
  /** Additional class name for the container */
  className?: string;
}

/**
 * Unified loading spinner. Uses design system tokens for consistent styling.
 * Canonical loading primitive — prefer this over per-view loading markup.
 */
export function LoadingSpinner({
  size = 40,
  message,
  fullscreen = false,
  className = '',
}: LoadingSpinnerProps) {
  const containerClass = [
    'loading-spinner-container',
    fullscreen ? 'loading-spinner-fullscreen' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClass}>
      <div
        className="loading-spinner"
        style={{ width: size, height: size }}
        role="status"
        aria-label="Loading"
      />
      {message && <p className="loading-spinner-message">{message}</p>}
    </div>
  );
}

export default LoadingSpinner;
