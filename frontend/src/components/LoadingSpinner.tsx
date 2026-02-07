interface LoadingSpinnerProps {
  /** Size of the spinner in pixels. Default: 40 */
  size?: number;
  /** Optional message to display below the spinner */
  message?: string;
  /** Additional class name for the container */
  className?: string;
}

/**
 * Unified loading spinner component.
 * Uses design system tokens for consistent styling.
 */
export function LoadingSpinner({
  size = 40,
  message,
  className = '',
}: LoadingSpinnerProps) {
  return (
    <div className={`loading-spinner-container ${className}`}>
      <div
        className="loading-spinner"
        style={{
          width: size,
          height: size,
        }}
        role="status"
        aria-label="Loading"
      />
      {message && <p className="loading-spinner-message">{message}</p>}
    </div>
  );
}

export default LoadingSpinner;
