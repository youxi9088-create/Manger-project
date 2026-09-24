import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { APP_CONFIG } from './config';
import 'tdesign-react/esm/style/index.js';
import './index.css';

const routerBase = import.meta.env.BASE_URL.replace(/\/$/, '');
// The analyzer is served beneath OpenClaw in FN. Derive the API prefix from
// Vite's deployed base path so it also works when VITE_API_BASE is absent.
const apiBase = import.meta.env.VITE_API_BASE
  || routerBase.replace(/\/im-analyzer$/, '');

if (apiBase) {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      return nativeFetch(`${apiBase}${input}`, init);
    }
    return nativeFetch(input, init);
  }) as typeof window.fetch;
}

// 设置页面标题
document.title = APP_CONFIG.name;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBase || undefined}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
