// Modifica il componente SharedChat per auto-autenticarsi con Ragflow
// File: SharedChat/index.tsx

import React, { useState, useEffect, useRef } from 'react';
import ChatContainer from './large';
import styles from './index.less';

const MAX_CHAT_HEIGHT = 1600;
const MIN_CHAT_HEIGHT = 350;

// Configurazione account Ragflow di servizio
const RAGFLOW_SERVICE_ACCOUNT = {
  email: 'chatbot@sgailegal.com',  // Account dedicato per la chat pubblica
  password: 'your_secure_password_here'  // IMPORTANTE: usa variabili d'ambiente in produzione!
};

const SharedChat = () => {
  const [theme, setTheme] = useState(() => localStorage.getItem('sgai-theme') || 'dark');
  const [ready, setReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [authAttempts, setAuthAttempts] = useState(0);

  // ─────────────────────────────────────────────────────────
  // Funzione per autenticarsi con Ragflow
  // ─────────────────────────────────────────────────────────
  const authenticateWithRagflow = async (): Promise<boolean> => {
    try {
      console.log('[RAGFLOW AUTH] Tentativo di autenticazione...');
      
      // Prima controlla se hai già un token valido
      const existingToken = localStorage.getItem('authorization');
      if (existingToken) {
        const checkRes = await fetch('/v1/user/info', {
          headers: { 'Authorization': existingToken }
        });
        
        if (checkRes.ok) {
          console.log('[RAGFLOW AUTH] Token esistente valido');
          setReady(true);
          return true;
        }
      }

      // Se non hai un token valido, autenticati
      const loginRes = await fetch('/v1/user/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: RAGFLOW_SERVICE_ACCOUNT.email,
          password: RAGFLOW_SERVICE_ACCOUNT.password
        })
      });

      if (loginRes.ok) {
        const data = await loginRes.json();
        console.log('[RAGFLOW AUTH] Risposta login:', data.retcode, data.retmsg);
        
        if (data.retcode === 0 && data.data?.access_token) {
          const token = `Bearer ${data.data.access_token}`;
          localStorage.setItem('authorization', token);
          console.log('[RAGFLOW AUTH] Login riuscito, token salvato');
          setReady(true);
          return true;
        }
      }

      console.error('[RAGFLOW AUTH] Login fallito');
      return false;
    } catch (err) {
      console.error('[RAGFLOW AUTH] Errore:', err);
      return false;
    }
  };

  // ─────────────────────────────────────────────────────────
// Debug wrapper fetch (aggiornato: inietta automaticamente Authorization)
// ─────────────────────────────────────────────────────────
if (!(window as any).__rf_debug_fetch_installed) {
  (window as any).__rf_debug_fetch_installed = true;

  const _fetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : (input as Request).url;
    const method = init?.method || 'GET';
    const lsAuth = localStorage.getItem('authorization') || '';

    // Normalizza headers (gestisce object, Headers, Request)
    let headers: Headers;
    if (init?.headers instanceof Headers) {
      headers = new Headers(init.headers);
    } else if (init?.headers) {
      headers = new Headers(init.headers as Record<string, string>);
    } else if (input instanceof Request) {
      headers = new Headers(input.headers || undefined);
    } else {
      headers = new Headers();
    }

    const hasAuthHeader = headers.has('Authorization') || headers.has('authorization');

    // 1) decide se serve l'auth (escludi sia /v1/user/login che /api/v1/user/login)
    const u = new URL(urlStr, window.location.origin);
    const path = u.pathname;
    const isLogin = /^(\/(api\/)?v1\/user\/login)$/.test(path);
    const needsAuth = /^\/(api\/)?v1\//.test(path) && !isLogin;

    // 2) inietta il token (garantisci il prefisso Bearer)
    if (needsAuth && !hasAuthHeader && lsAuth) {
      const finalToken = lsAuth.startsWith('Bearer ') ? lsAuth : `Bearer ${lsAuth}`;
      headers.set('Authorization', finalToken);
      init = { ...(init || {}), headers };
    } else if (init && headers !== init.headers) {
      init = { ...init, headers };
    }


    console.log(
      `%c[RF-FETCH] ${method} ${urlStr}`,
      'color:#09f;font-weight:600',
      {
        hasAuthHeader: headers.has('Authorization') || headers.has('authorization'),
        lsAuthPresent: !!lsAuth,
        authPreview: (headers.get('Authorization') || headers.get('authorization') || lsAuth || '(none)')
          .slice(0, 24) + '…',
      }
    );

    const res = await _fetch(input, init);

    // 🔎 Logga la risposta delle completions per capire se l'errore arriva dal body
    try {
      const u2 = new URL(urlStr, window.location.origin);
      if (/\/api\/v1\/agentbots\/[^/]+\/completions$/.test(u2.pathname)) {
        // prova JSON, altrimenti testo
        res.clone().json()
          .then(d => console.log('%c[COMPLETIONS RESP JSON]', 'color:#0a0', d))
          .catch(() => res.clone().text()
            .then(t => console.log('%c[COMPLETIONS RESP TEXT]', 'color:#0a0', t.slice(0, 500)))
          );
      }
    } catch {}

    if (res.status === 401) {
      let body = '';
      try { body = await res.clone().text(); } catch {}
      console.warn('%c[RF-FETCH-401]', 'color:#f40;font-weight:700', {
        url: urlStr, method, status: res.status, body: body?.slice(0, 400),
      });

      // Riprova l’autenticazione se fallisce
      if (typeof setAuthAttempts === 'function') {
        // @ts-ignore: setAuthAttempts è nello scope del componente
        setAuthAttempts((prev: number) => {
          const next = prev + 1;
          if (next <= 3 && typeof authenticateWithRagflow === 'function') {
            setTimeout(() => {
              // @ts-ignore
              authenticateWithRagflow();
            }, 1000);
          }
          return next;
        });
      }

      window.parent?.postMessage({ type: 'rf-401', url: urlStr, method }, '*');
    }

    return res;
  };
}


// ─────────────────────────────────────────────────────────
// Patch EventSource: aggiunge il token in query per SSE
// ─────────────────────────────────────────────────────────
if (!(window as any).__rf_es_installed) {
  (window as any).__rf_es_installed = true;

  const OriginalES = (window as any).EventSource;

  // @ts-ignore override globale
  (window as any).EventSource = function(input: string, init?: EventSourceInit) {
    try {
      let urlStr = typeof input === 'string' ? input : String(input);
      const u = new URL(urlStr, window.location.origin);

      const path = u.pathname;
      const isApiV1 = /^\/(api\/)?v1\//.test(path);
      const lsAuth = localStorage.getItem('authorization') || '';

      if (isApiV1 && lsAuth) {
        // garantisci prefisso Bearer e passa sia authorization che token (per compatibilità)
        const finalToken = lsAuth.startsWith('Bearer ') ? lsAuth : `Bearer ${lsAuth}`;
        if (!u.searchParams.has('authorization')) {
          u.searchParams.set('authorization', finalToken);
        }
        if (!u.searchParams.has('token')) {
          u.searchParams.set('token', finalToken.replace(/^Bearer\s+/i, ''));
        }
        urlStr = u.toString();
      }

      return new OriginalES(urlStr, init);
    } catch {
      return new OriginalES(input as any, init);
    }
  } as any;

  (window as any).EventSource.prototype = OriginalES.prototype;
  (window as any).EventSource.CONNECTING = OriginalES.CONNECTING;
  (window as any).EventSource.OPEN = OriginalES.OPEN;
  (window as any).EventSource.CLOSED = OriginalES.CLOSED;
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

      // Se il parent invia un token, usalo (opzionale)
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
  // Auto-autenticazione all'avvio
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    const initialize = async () => {
      // Controlla prima i parametri URL
      const url = new URL(window.location.href);
      const qpAuth = url.searchParams.get('auth');
      if (qpAuth) {
        console.log('%c[QP AUTH] trovato in URL', 'color:#fa0');
        localStorage.setItem('authorization', qpAuth);
        setReady(true);
        return;
      }

      // Controlla se hai già un token
      const existingToken = localStorage.getItem('authorization');
      if (existingToken) {
        // Verifica che sia valido
        try {
          const checkRes = await fetch('/v1/user/info', {
            headers: { 'Authorization': existingToken }
          });
          if (checkRes.ok) {
            setReady(true);
            return;
          }
        } catch (err) {
          console.warn('[TOKEN CHECK] Errore verifica token:', err);
        }
      }

      // Se non hai un token valido, autenticati automaticamente
      console.log('[INIT] Nessun token valido, avvio auto-autenticazione...');
      const authSuccess = await authenticateWithRagflow();
      
      if (!authSuccess) {
        // Se fallisce, chiedi al parent (fallback)
        console.warn('[INIT] Auto-auth fallita, chiedo al parent...');
        window.parent?.postMessage({ type: 'shared-needs-token' }, '*');
        
        // Riprova dopo 5 secondi
        setTimeout(() => {
          if (!ready) {
            authenticateWithRagflow();
          }
        }, 5000);
      }
    };

    initialize();
  }, []);

  if (!ready) {
    return (
      <div
        className={`${styles.chatWrapper} ${styles[theme]}`}
        ref={containerRef}
        style={{ 
          padding: 20, 
          textAlign: 'center',
          fontSize: 14,
          color: theme === 'dark' ? '#999' : '#666'
        }}
      >
        <div style={{ marginBottom: 10 }}>Inizializzazione chat in corso...</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          {authAttempts > 0 && `Tentativo ${authAttempts}/3`}
        </div>
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