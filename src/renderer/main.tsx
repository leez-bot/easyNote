import React from 'react'
import ReactDOM from 'react-dom/client'
import { App as AntdApp, ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import { App } from './App'
import 'antd/dist/reset.css'
import 'dayjs/locale/zh-cn'
import './styles/app.css'

dayjs.locale('zh-cn')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.compactAlgorithm,
        token: {
          borderRadius: 6,
          colorBgLayout: '#f7f9fc',
          colorBorder: '#d5dce7',
          colorError: '#ef4444',
          colorInfo: '#2563eb',
          colorPrimary: '#2563eb',
          colorSuccess: '#16a34a',
          colorText: '#172033',
          colorTextSecondary: '#7b8494',
          colorWarning: '#f59e0b',
          fontFamily: '"Segoe UI", "Microsoft YaHei", Arial, sans-serif',
          fontSize: 13,
          controlHeight: 34,
        },
      }}
    >
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
)
