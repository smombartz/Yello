import type { ReactNode } from 'react';
import { App as AntApp, ConfigProvider } from 'antd';
import { TokenBridge } from './TokenBridge';

/** Stock Ant Design for the whole app. No token overrides (see docs/plans/2026-11-05-ant-design-migration.md). */
export function AntProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider>
      {/* component={false}: no wrapper div, so the existing layout CSS is unaffected */}
      <AntApp component={false}>
        <TokenBridge />
        {children}
      </AntApp>
    </ConfigProvider>
  );
}
