// File: src/pages/chat/share/index.tsx
import React, { useState, useEffect, useRef } from 'react';
import ChatContainer from './large';
import styles from './index.less';

const MAX_CHAT_HEIGHT = 1600;
const MIN_CHAT_HEIGHT = 350;

/** Schermata per inserire la API key localmente */
const ApiKeyGate: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const [value, setValue] = useState<string>(() => {
    try {
      return localStorage.getItem('ragflow_api_key') || '';
    } catch {
      return '';
    }
  });
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const v = value.trim();
    if (!v.startsWith('ragflow-')) {
      setError('La API key deve iniziare con "ragflow-".');
      return;
    }
    try {
      localStorage.setItem('ragflow_api_key', v);
      setError(null);
      onSaved();
    } catch {
      setError('Impossibile salvare la chiave nel browser.');
    }
  };

  return (
    <div
      style={{
        maxWidth: 520,
        margin: '40px auto',
        padding: 16,
        border: '1px solid var(--border-color, #333)',
        borderRadius: 12,
      }}
    >
      <h3 style={{ marginTop: 0 }}>Imposta API key RAGFlow</h3>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Inserisci la tua API key (formato <code>ragflow-…</code>). Verrà salvata solo nel tuo browser.
      </p>
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="ragflow-…"
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid #666',
          background: 'transparent',
          color: 'inherit',
        }}
      />
      {error && <div style={{ color: '#e66', marginTop: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={save} className={styles.glassBtn}>Salva</button>
        <button
          onClick={() => {
            setValue('');
            setError(null);
          }}
          className={styles.glassBtn}
        >
          Pulisci
        </button>
      </div>
    </div>
  );
};

const SharedChat: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return (localStorage.getItem('sgai-theme') as 'light' | 'dark') || 'dark';
    } catch {
      return 'dark';
    }
  });

  const [apiKeyReady, setApiKeyReady] = useState<boolean>(() => {
    try {
      return !!localStorage.getItem('ragflow_api_key');
    } catch {
      return false;
    }
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // 1) Bootstrap locale: ?rf_key=ragflow-... nella URL
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const rfKey = url.searchParams.get('rf_key');
      if (rfKey && rfKey.startsWith('ragflow-')) {
        localStorage.setItem('ragflow_api_key', rfKey);
        setApiKeyReady(true);
      }
    } catch {
      // ignore
    }
  }, []);

  // 2) Opzionale: accetta la API key anche via postMessage (tutto dentro useEffect!)
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const d = ev?.data;
      if (d?.type === 'ragflow-api-key' && typeof d.key === 'string' && d.key.startsWith('ragflow-')) {
        try {
          localStorage.setItem('ragflow_api_key', d.key);
          setApiKeyReady(true);
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // 3) Fix input su mobile (scroll su iOS)
  useEffect(() => {
    const handleVisibilityChange = () => {
      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement && activeElement.tagName === 'TEXTAREA') {
        window.scrollTo(0, 0);
        setTimeout(() => {
          activeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('resize', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleVisibilityChange);
    };
  }, []);

  // 4) Altri messaggi dal parent (tema, sharedId, richiesta altezza, token compat)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const d = event?.data;

      // shared-id
      if (d?.type === 'shared-ctx' && d.sharedId) {
        try {
          localStorage.setItem('share_shared_id', String(d.sharedId));
        } catch {}
      }

      // richiesta altezza dinamica
      if (d?.type === 'request-height' && containerRef.current) {
        const rawHeight = containerRef.current.scrollHeight;
        const boundedHeight = Math.max(MIN_CHAT_HEIGHT, Math.min(rawHeight, MAX_CHAT_HEIGHT));
        window.parent?.postMessage({ type: 'iframe-height', height: boundedHeight }, '*');
      }

      // cambio tema
      if (d?.type === 'theme-change' && (d.theme === 'light' || d.theme === 'dark')) {
        setTheme(d.theme);
        document.documentElement.setAttribute('data-theme', d.theme);
        try {
          localStorage.setItem('sgai-theme', d.theme);
        } catch {}
      }

      // compat: token fittizio
      if (d?.type === 'ragflow-token' && d.token) {
        try {
          if (!localStorage.getItem('Token')) {
            const t = (crypto?.randomUUID?.() || `${Date.now()}_${Math.random()}`)
              .replace(/[^a-zA-Z0-9]/g, '')
              .slice(0, 32);
            localStorage.setItem('Token', t);
          }
        } catch {}
      }

      // limit-status: se serve, gestisci qui
    };

    window.addEventListener('message', handleMessage);
    // imposta attributo tema al mount e quando cambia
    document.documentElement.setAttribute('data-theme', theme);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [theme]);

  return (
    <div className={`${styles.chatWrapper} ${styles[theme]}`} ref={containerRef}>
      {apiKeyReady ? (
        <ChatContainer theme={theme} />
      ) : (
        <ApiKeyGate onSaved={() => setApiKeyReady(true)} />
      )}
    </div>
  );
};

export default SharedChat;
