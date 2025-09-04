// File: SharedChat/index.tsx
// Auto-autenticazione con Ragflow usando API token beta

import React, { useState, useEffect, useRef } from 'react';
import ChatContainer from './large';
import styles from './index.less';

const MAX_CHAT_HEIGHT = 1600;
const MIN_CHAT_HEIGHT = 350;

// ⚠️ Inserisci qui il valore del campo `beta` preso da MySQL (tabella api_token)
const RAGFLOW_API_KEY = "lmMmVjNjNhZWExNDExZWY4YTVkMDI0Mm";

const SharedChat: React.FC = () => {
  const [theme, setTheme] = useState(() => localStorage.getItem('sgai-theme') || 'dark');
  const [ready, setReady] = useState(false);
  const [authAttempts, setAuthAttempts] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // ──────────────────────────────
  // Autenticazione con API token
  // ──────────────────────────────
  const authenticateWithRagflow = async (): Promise<boolean> => {
    try {
      console.log('[RAGFLOW AUTH] Inietto API key beta…');
      const token = `Bearer ${RAGFLOW_API_KEY}`;
      localStorage.setItem('authorization', token);
      setReady(true);
      return true;
    } catch (err) {
      console.error('[RAGFLOW AUTH] Errore:', err);
      return false;
    }
  };

  // ──────────────────────────────
  // Patch fetch: aggiunge Authorization se manca
  // ──────────────────────────────
  if (!(window as any).__rf_debug_fetch_installed) {
    (window as any).__rf_debug_fetch_installed = true;

    const _fetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : (input as Request).url;
      const method = init?.method || 'GET';
      const lsAuth = localStorage.getItem('authorization') || '';

      let headers = new Headers(init?.headers || (input instanceof Request ? input.headers : {}));
      const hasAuthHeader = headers.has('Authorization') || headers.has('authorization');

      const path = new URL(urlStr, window.location.origin).pathname;
      const isLogin = /^(\/(api\/)?v1\/user\/login)$/.test(path);
      const needsAuth = /^\/(api\/)?v1\//.test(path) && !isLogin;

      if (needsAuth && !hasAuthHeader && lsAuth) {
        const finalToken = lsAuth.startsWith('Bearer ') ? lsAuth : `Bearer ${lsAuth}`;
        headers.set('Authorization', finalToken);
        init = { ...(init || {}), headers };
      }

      console.log(`[RF-FETCH] ${method} ${urlStr}`, {
        hasAuthHeader,
        lsAuthPresent: !!lsAuth,
        authPreview: (headers.get('Authorization') || lsAuth || '(none)').slice(0, 24) + '…',
      });

      const res = await _fetch(input, init);

      // log completions
      if (/\/api\/v1\/agentbots\/[^/]+\/completions$/.test(path)) {
          const clone = res.clone();
          clone.text().then(t => {
            try {
              console.log('[COMPLETIONS RESP]', JSON.parse(t));
            } catch {
              console.log('[COMPLETIONS RESP RAW]', t.slice(0, 400));
            }
          });
        }


      if (res.status === 401) {
        console.warn('[RF-FETCH-401]', { url: urlStr, method, status: res.status });
        setAuthAttempts(prev => {
          const next = prev + 1;
          if (next <= 3) setTimeout(() => authenticateWithRagflow(), 1000);
          return next;
        });
        window.parent?.postMessage({ type: 'rf-401', url: urlStr, method }, '*');
      }

      return res;
    };
  }

  // ──────────────────────────────
  // Patch EventSource: aggiunge token in query
  // ──────────────────────────────
  if (!(window as any).__rf_es_installed) {
    (window as any).__rf_es_installed = true;

    const OriginalES = (window as any).EventSource;
    (window as any).EventSource = function (input: string, init?: EventSourceInit) {
      let urlStr = typeof input === 'string' ? input : String(input);
      const u = new URL(urlStr, window.location.origin);
      const lsAuth = localStorage.getItem('authorization') || '';

      if (/^\/(api\/)?v1\//.test(u.pathname) && lsAuth) {
        const finalToken = lsAuth.startsWith('Bearer ') ? lsAuth : `Bearer ${lsAuth}`;
        u.searchParams.set('authorization', finalToken);
        u.searchParams.set('token', finalToken.replace(/^Bearer\s+/i, ''));
        urlStr = u.toString();
      }

      return new OriginalES(urlStr, init);
    } as any;

    (window as any).EventSource.prototype = OriginalES.prototype;
    (window as any).EventSource.CONNECTING = OriginalES.CONNECTING;
    (window as any).EventSource.OPEN = OriginalES.OPEN;
    (window as any).EventSource.CLOSED = OriginalES.CLOSED;
  }

  // ──────────────────────────────
  // Gestione messaggi dal parent
  // ──────────────────────────────
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'request-height' && containerRef.current) {
        const rawHeight = containerRef.current.scrollHeight;
        const boundedHeight = Math.max(MIN_CHAT_HEIGHT, Math.min(rawHeight, MAX_CHAT_HEIGHT));
        window.parent.postMessage({ type: 'iframe-height', height: boundedHeight }, '*');
      }

      if (event.data?.type === 'theme-change') {
        setTheme(event.data.theme);
        document.documentElement.setAttribute('data-theme', event.data.theme);
      }

      if (event.data?.type === 'ragflow-token' && event.data.token) {
        localStorage.setItem('authorization', event.data.token);
        setReady(true);
      }
    };

    window.addEventListener('message', handleMessage);
    document.documentElement.setAttribute('data-theme', theme);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [theme]);

  // ──────────────────────────────
  // Init: auto-auth
  // ──────────────────────────────
  useEffect(() => {
    const initialize = async () => {
      const qpAuth = new URL(window.location.href).searchParams.get('auth');
      if (qpAuth) {
        localStorage.setItem('authorization', qpAuth);
        setReady(true);
        return;
      }

      const existingToken = localStorage.getItem('authorization');
      if (existingToken) {
        setReady(true);
        return;
      }

      await authenticateWithRagflow();
    };

    initialize();
  }, []);

  if (!ready) {
    return (
      <div className={`${styles.chatWrapper} ${styles[theme]}`} ref={containerRef}
           style={{ padding: 20, textAlign: 'center', fontSize: 14, color: theme === 'dark' ? '#999' : '#666' }}>
        <div>Inizializzazione chat in corso…</div>
        {authAttempts > 0 && <div style={{ fontSize: 12, opacity: 0.7 }}>Tentativo {authAttempts}/3</div>}
      </div>
    );
  }

  return (
    <div className={`${styles.chatWrapper} ${styles[theme]}`} ref={containerRef}>
      <ChatContainer theme={theme} />
    </div>
  );
};

export default SharedChat;
