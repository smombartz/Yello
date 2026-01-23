interface ThresholdSelectorProps {
  threshold: number;
  onThresholdChange: (threshold: number) => void;
  disabled?: boolean;
}

const THRESHOLD_OPTIONS = [
  { value: 2, label: '2+ domains' },
  { value: 3, label: '3+ domains' },
  { value: 4, label: '4+ domains' },
  { value: 5, label: '5+ domains' },
];

export function ThresholdSelector({
  threshold,
  onThresholdChange,
  disabled = false
}: ThresholdSelectorProps) {
  return (
    <div className="threshold-selector">
      <label htmlFor="threshold-select">Domain threshold:</label>
      <select
        id="threshold-select"
        value={threshold}
        onChange={(e) => onThresholdChange(Number(e.target.value))}
        disabled={disabled}
        className="threshold-select"
      >
        {THRESHOLD_OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
