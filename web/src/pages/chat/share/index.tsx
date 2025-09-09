import React, { useState, useEffect, useRef } from 'react';
import ChatContainer from './large';
import styles from './index.less';

const MAX_CHAT_HEIGHT = 1600;
const MIN_CHAT_HEIGHT = 350;

const ApiKeyGate: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const [value, setValue] = useState(localStorage.getItem('ragflow_api_key') || '');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const v = value.trim();
    if (!v.startsWith('ragflow-')) {
      setError('La API key deve iniziare con "ragflow-".');
      return;
    }
    localStorage.setItem('ragflow_api_key', v);
    setError(null);
    onSaved();
  };

  return (
    <div style={{
      maxWidth: 520, margin: '40px auto', padding: 16,
      border: '1px solid var(--border-color, #333)', borderRadius: 12
    }}>
      <h3 style={{ marginTop: 0 }}>Imposta API key RAGFlow</h3>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Inserisci la tua API key (formato <code>ragflow-…</code>). Verrà salvata solo nel tuo browser.
      </p>
      <input
        type="password"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="ragflow-…"
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8,
          border: '1px solid #666', background: 'transparent', color: 'inherit'
        }}
      />
      {error && <div style={{ color: '#e66', marginTop: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={save} className={styles.glassBtn}>Salva</button>
        <button onClick={() => { setValue(''); setError(null); }} className={styles.glassBtn}>Pulisci</button>
      </div>
    </div>
  );
};

const SharedChat: React.FC = () => {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('sgai-theme') || 'dark';
  });

  const [apiKeyReady, setApiKeyReady] = useState<boolean>(() => {
    return !!localStorage.getItem('ragflow_api_key');
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // Bootstrap locale
  useEffect(() => {
    const url = new URL(window.location.href);

    // 1) salva lo shared_id per i hook
    const qpShared = url.searchParams.get('shared_id');
    if (qpShared) {
      localStorage.setItem('share_shared_id', qpShared);
    }

    // 2) accetta la key via query param rf_key (comodo nell'embed)
    const rfKey = url.searchParams.get('rf_key');
    if (rfKey && rfKey.startsWith('ragflow-')) {
      localStorage.setItem('ragflow_api_key', rfKey);
      setApiKeyReady(true);
    }

    // 3) token locale per compat
    if (!localStorage.getItem('Token')) {
      const t = (crypto?.randomUUID?.() || `${Date.now()}_${Math.random()}`)
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 32);
      localStorage.setItem('Token', t);
    }
  }, []);

  // Fix input su mobile (scroll su iOS)
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

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // ricevi contesto shared-id
      if (event.data?.type === 'shared-ctx' && event.data.sharedId) {
        localStorage.setItem('share_shared_id', event.data.sharedId);
      }

      // ricevi API key dal parent (se vuoi gestirla esternamente)
      if (event.data?.type === 'ragflow-api-key' && typeof event.data.key === 'string') {
        if (event.data.key.startsWith('ragflow-')) {
          localStorage.setItem('ragflow_api_key', event.data.key);
          setApiKeyReady(true);
        }
      }

      if (event.data?.type === 'request-height' && containerRef.current) {
        const rawHeight = containerRef.current.scrollHeight;
        const boundedHeight = Math.max(
          MIN_CHAT_HEIGHT,
          Math.min(rawHeight, MAX_CHAT_HEIGHT),
        );
        window.parent.postMessage({ type: 'iframe-height', height: boundedHeight }, '*');
      }

      if (event.data?.type === 'theme-change') {
        setTheme(event.data.theme);
        document.documentElement.setAttribute('data-theme', event.data.theme);
      }

      if (event.data?.type === 'ragflow-token' && event.data.token) {
        // compat: NON tocchiamo share_auth; non serve per la API key
        if (!localStorage.getItem('Token')) {
          const t = (crypto?.randomUUID?.() || `${Date.now()}_${Math.random()}`)
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(0, 32);
          localStorage.setItem('Token', t);
        }
      }

      if (event.data?.type === 'limit-status') {
        // se serve, propagalo via prop/context a ChatContainer
      }
    };

    window.addEventListener('message', handleMessage);
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
