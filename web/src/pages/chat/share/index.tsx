import React, { useState, useEffect, useRef } from 'react';
import ChatContainer from './large';
import styles from './index.less';

const MAX_CHAT_HEIGHT = 1600;
const MIN_CHAT_HEIGHT = 350;

const SharedChat = () => {
  const [theme, setTheme] = useState(() => localStorage.getItem('sgai-theme') || 'dark');
  const [ready, setReady] = useState(false); // ⬅️ gate: monta la chat SOLO quando c’è il token
  const containerRef = useRef<HTMLDivElement>(null);

  // ─────────────────────────────────────────────────────────
  // DEBUG: Wrapper globale fetch → logga URL, header, 401 con body
  // ─────────────────────────────────────────────────────────
  if (!(window as any).__rf_debug_fetch_installed) {
    (window as any).__rf_debug_fetch_installed = true;

    const _fetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      const method = init?.method || 'GET';
      const hdrs = (init?.headers as any) || {};
      const hasAuthHeader = !!hdrs.Authorization || !!hdrs.authorization;
      const lsAuth = localStorage.getItem('authorization');

      console.log(
        `%c[RF-FETCH] ${method} ${url}`,
        'color:#09f;font-weight:600',
        {
          hasAuthHeader,
          lsAuthPresent: !!lsAuth,
          // NON stampo il token intero per sicurezza:
          authPreview: hasAuthHeader
            ? String(hdrs.Authorization || hdrs.authorization).slice(0, 24) + '…'
            : (lsAuth ? String(lsAuth).slice(0, 24) + '…' : '(none)'),
        }
      );

      const res = await _fetch(input, init);

      if (res.status === 401) {
        let body = '';
        try { body = await res.clone().text(); } catch {}
        console.warn('%c[RF-FETCH-401]', 'color:#f40;font-weight:700', {
          url, method, status: res.status, body: body?.slice(0, 400),
        });
        // Notifica il parent per visibilità immediata (toast)
        window.parent?.postMessage({ type: 'rf-401', url, method }, '*');
      }

      return res;
    };
  }

  // ─────────────────────────────────────────────────────────
  // Init: tema + handshake parent + osservatori
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event?.data) return;

      if (event.data.type === 'request-height') {
        if (!containerRef.current) return;
        const rawHeight = containerRef.current.scrollHeight;
        const boundedHeight = Math.max(MIN_CHAT_HEIGHT, Math.min(rawHeight, MAX_CHAT_HEIGHT));
        console.log('[IFRAME→PARENT] iframe-height', { rawHeight, boundedHeight });
        window.parent.postMessage({ type: 'iframe-height', height: boundedHeight }, '*');
      }

      if (event.data.type === 'theme-change') {
        console.log('[MSG] theme-change', event.data.theme);
        setTheme(event.data.theme);
        document.documentElement.setAttribute('data-theme', event.data.theme);
      }

      // ⬇️ parent invia il token non appena lo ottiene
      if (event.data.type === 'ragflow-token' && event.data.token) {
        console.log('%c[TOKEN] ricevuto dal parent', 'color:#3c3;font-weight:700');
        localStorage.setItem('authorization', event.data.token);
        setReady(true);
      }
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === containerRef.current) {
          const rawHeight = entry.target.scrollHeight;
          const boundedHeight = Math.max(MIN_CHAT_HEIGHT, Math.min(rawHeight, MAX_CHAT_HEIGHT));
          window.parent.postMessage({ type: 'iframe-height', height: boundedHeight }, '*');
        }
      }
    });

    if (containerRef.current) resizeObserver.observe(containerRef.current);

    window.addEventListener('message', handleMessage);
    document.documentElement.setAttribute('data-theme', theme);

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'sgai-theme' && event.newValue) {
        setTheme(event.newValue);
        document.documentElement.setAttribute('data-theme', event.newValue);
      }
      // Se un altro tab ha messo il token, sblocca
      if (event.key === 'authorization' && event.newValue && !ready) {
        setReady(true);
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorageChange);
      if (containerRef.current) resizeObserver.unobserve(containerRef.current);
      resizeObserver.disconnect();
    };
  }, [theme, ready]);

  // ─────────────────────────────────────────────────────────
  // Gate token: legge ?auth=, localStorage e, se manca, chiede al parent
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href);
      const qpAuth = url.searchParams.get('auth');
      if (qpAuth) {
        console.log('%c[QP AUTH] trovato in URL', 'color:#fa0');
        localStorage.setItem('authorization', qpAuth);
      }

      let tok = localStorage.getItem('authorization');
      if (tok) {
        setReady(true);
        return;
      }

      console.warn('%c[NO TOKEN] chiedo al parent…', 'color:#f40');
      window.parent?.postMessage({ type: 'shared-needs-token' }, '*');

      // piccolo timeout di sicurezza per log
      setTimeout(() => {
        if (!localStorage.getItem('authorization') && !ready) {
          console.warn('[TIMEOUT] nessun token ancora disponibile dopo 2s');
        }
      }, 2000);
    })();
  }, [ready]);

  if (!ready) {
    return (
      <div
        className={`${styles.chatWrapper} ${styles[theme]}`}
        ref={containerRef}
        style={{ padding: 12, opacity: 0.8, fontSize: 13 }}
      >
        Inizializzazione chat… (in attesa del token)
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
