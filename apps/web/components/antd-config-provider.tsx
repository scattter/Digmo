'use client';

import React from 'react';
import { ConfigProvider, App } from 'antd';
import { useUiMode } from '@/hooks/use-ui-mode';
import zhCN from 'antd/locale/zh_CN';

export function AntdConfigProvider({ children }: { children: React.ReactNode }) {
  const { mode } = useUiMode();

  const theme = {
    token: {
      colorPrimary: mode === 'minimal' ? '#1677ff' : '#000000', // Example mapping
      borderRadius: 6,
    },
    components: {
        Layout: {
            headerBg: '#fff',
        }
    }
  };

  return (
    <ConfigProvider locale={zhCN} theme={theme}>
      <App>
        {children}
      </App>
    </ConfigProvider>
  );
}
