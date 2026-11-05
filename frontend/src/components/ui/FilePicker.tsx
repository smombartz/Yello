import { Upload } from 'antd';
import { uploadListIcons } from '../../theme/antIcons';
import { Button } from './Button';

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
 * Canonical file-chooser for import flows (Ant Upload). It never uploads by
 * itself: the chosen file is handed to `onChange` and the caller submits it.
 * Pair with a secondary `<Button>` submit inside `.import-controls`.
 */
export function FilePicker({ id, accept, file, onChange, prompt = 'Choose file', disabled = false }: FilePickerProps) {
  return (
    <Upload
      id={id}
      accept={accept}
      maxCount={1}
      disabled={disabled}
      {...uploadListIcons}
      beforeUpload={(f) => { onChange(f); return false; }}
      fileList={file ? [{ uid: '1', name: file.name, status: 'done' }] : []}
      onRemove={() => onChange(null)}
    >
      <Button icon="upload" disabled={disabled}>{prompt}</Button>
    </Upload>
  );
}
