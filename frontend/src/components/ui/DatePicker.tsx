import { DatePicker as AntDatePicker, TimePicker as AntTimePicker } from 'antd';
import type { DatePickerProps, TimePickerProps } from 'antd';
import { pickerPanelIcons } from '../../theme/antIcons';

/** Ant's DatePicker with Tabler panel arrows (no global setting exists for them) */
export function DatePicker(props: DatePickerProps) {
  return <AntDatePicker {...pickerPanelIcons} {...props} />;
}
export function TimePicker(props: TimePickerProps) {
  return <AntTimePicker {...pickerPanelIcons} {...props} />;
}
