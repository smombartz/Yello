import { Input } from 'antd';
import type { PasswordProps } from 'antd/es/input';
import { passwordIconRender } from '../../theme/antIcons';

export function PasswordInput(props: PasswordProps) {
  return <Input.Password iconRender={passwordIconRender} {...props} />;
}
