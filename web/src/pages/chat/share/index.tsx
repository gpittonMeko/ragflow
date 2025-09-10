// File: SharedChat/index.tsx
import React, { useState, useEffect, useRef } from 'react';
import ChatContainer from './large';
import styles from './index.less';

const MAX_CHAT_HEIGHT = 1600;
const MIN_CHAT_HEIGHT = 350;

const STEP_CHAT_HEIGHT = 200;   // crescita massima per volta

const SharedChat: React.FC = () => {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('sgai-theme') || 'dark';
  });
  const lastHeightRef = useRef(MIN_CHAT_HEIGHT);

  const containerRef = useRef<HTMLDivElement>(null);

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
    console.log('[IFRAME] Messaggio ricevuto:', event.data);

    if (event.data?.type === 'request-height' && containerRef.current) {
      const rawHeight = containerRef.current.scrollHeight;
      const boundedHeight = Math.min(rawHeight, MAX_CHAT_HEIGHT);
      console.log('[IFRAME] Invio altezza al parent:', boundedHeight);
      window.parent.postMessage(
        { type: 'iframe-height', height: boundedHeight },
        '*'
      );
    }

    if (event.data?.type === 'theme-change') {
      console.log('[IFRAME] Cambio tema →', event.data.theme);
      setTheme(event.data.theme);
      document.documentElement.setAttribute('data-theme', event.data.theme);
    }

    if (event.data?.type === 'ragflow-token' && event.data.token) {
      console.log('[IFRAME] Ricevuto token dal parent:', event.data.token);
      localStorage.setItem('Authorization', event.data.token);
      sessionStorage.setItem('Authorization', event.data.token);

      // debug extra: conferma subito che sia salvato
      console.log('[IFRAME] Token salvato in localStorage:', localStorage.getItem('Authorization'));
      console.log('[IFRAME] Token salvato in sessionStorage:', sessionStorage.getItem('Authorization'));
    }

    if (event.data?.type === 'limit-status') {
      console.log('[IFRAME] Stato limite ricevuto:', event.data.blocked);
      // TODO: passare a ChatContainer con prop o context
    }
  };

  window.addEventListener('message', handleMessage);

  document.documentElement.setAttribute('data-theme', theme);

  return () => {
    window.removeEventListener('message', handleMessage);
  };
}, [theme]);


useEffect(() => {
  if (!containerRef.current) return;

  const sendHeight = () => {
  if (!containerRef.current) return;
  const raw = containerRef.current.scrollHeight;

  // Calcola la nuova altezza in modo progressivo
  const nextHeight = Math.min(
    MAX_CHAT_HEIGHT,
    Math.max(
      lastHeightRef.current,
      Math.min(raw, lastHeightRef.current + STEP_CHAT_HEIGHT)
    )
  );

  lastHeightRef.current = nextHeight;

  window.parent.postMessage({ type: 'iframe-height', height: nextHeight }, '*');
};


  sendHeight();

  const ro = new ResizeObserver(sendHeight);
  ro.observe(containerRef.current);

  const mo = new MutationObserver(sendHeight);
  mo.observe(containerRef.current, { childList: true, subtree: true });

  return () => {
    ro.disconnect();
    mo.disconnect();
  };
}, []);





  return (
    <div
      className={`${styles.chatWrapper} ${styles[theme]}`}
      ref={containerRef}
    >
      <ChatContainer theme={theme} />
    </div>
  );
};

export default SharedChat;
