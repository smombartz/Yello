import { Space, Tabs as AntTabs, Tag, theme } from 'antd';
import { Icon, type IconName } from '../Icon';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Optional leading icon (a Tabler icon, see IconName) */
  icon?: IconName;
  /** Optional count pill; omit or pass null to hide it */
  count?: number | null;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Disables every tab (e.g. while the data behind the counts loads) */
  disabled?: boolean;
  'aria-label': string;
  className?: string;
}

/**
 * Canonical tab bar on Ant `Tabs`. Ant provides the tablist semantics and the
 * keyboard behaviour (Arrow keys, Home, End); the wrapper carries the accessible name.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  disabled = false,
  'aria-label': ariaLabel,
  className,
}: TabsProps<T>) {
  const { token } = theme.useToken();
  return (
    <div role="group" aria-label={ariaLabel} className={className}>
      <AntTabs
        activeKey={value}
        onChange={(key) => onChange(key as T)}
        items={items.map((item) => ({
          key: item.id,
          disabled,
          icon: item.icon ? <Icon name={item.icon} /> : undefined,
          label: (
            <Space size={token.marginXXS}>
              {item.label}
              {item.count != null && <Tag variant="filled">{item.count.toLocaleString()}</Tag>}
            </Space>
          ),
        }))}
      />
    </div>
  );
}
