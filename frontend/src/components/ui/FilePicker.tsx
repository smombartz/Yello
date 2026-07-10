import { Icon } from '../Icon';

interface FilePickerProps {
  /** Unique id linking the hidden input to its label */
  id: string;
  /** `accept` attribute for the file input (e.g. ".csv", ".vcf,text/vcard") */
  accept: string;
  /** Currently selected file, or null */
  file: File | null;
  /** Called with the chosen file (or null when cleared) */
  onChange: (file: File | null) => void;
  /** Text shown when no file is selected */
  prompt?: string;
  /** Disable selection (e.g. while an import is in progress) */
  disabled?: boolean;
}

/**
 * Canonical file-upload control for import flows. Renders a visually-hidden
 * native input plus a styled `.file-input-label` button that shows the chosen
 * filename. Pair with a `.secondary-button` submit inside `.import-controls`.
 */
export function FilePicker({ id, accept, file, onChange, prompt = 'Choose file', disabled = false }: FilePickerProps) {
  return (
    <div className="file-input-row">
      <input
        type="file"
        id={id}
        accept={accept}
        className="file-input"
        disabled={disabled}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <label htmlFor={id} className={`file-input-label${disabled ? ' is-disabled' : ''}`}>
        <Icon name="file-lines" />
        {file ? file.name : prompt}
      </label>
    </div>
  );
}
