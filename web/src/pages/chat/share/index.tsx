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
  // Debug wrapper fetch (mantieni il tuo esistente)
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
        
        // Se ricevi 401, riprova l'autenticazione
        if (authAttempts < 3) {
          setAuthAttempts(prev => prev + 1);
          setTimeout(() => authenticateWithRagflow(), 1000);
        }
        
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