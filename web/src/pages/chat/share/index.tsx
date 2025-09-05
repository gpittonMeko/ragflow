// File: SharedChat/index.tsx
import React, { useState, useEffect, useRef } from 'react';
import ChatContainer from './large';
import styles from './index.less';

const MAX_CHAT_HEIGHT = 1600;
const MIN_CHAT_HEIGHT = 350;

const SharedChat: React.FC = () => {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('sgai-theme') || 'dark';
  });

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
    // Altezza richiesta dal parent
    if (event.data?.type === 'request-height' && containerRef.current) {
      const rawHeight = containerRef.current.scrollHeight;
      const boundedHeight = Math.max(
        MIN_CHAT_HEIGHT,
        Math.min(rawHeight, MAX_CHAT_HEIGHT)
      );
      window.parent.postMessage(
        { type: 'iframe-height', height: boundedHeight },
        '*'
      );
    }

    // Tema dal parent
    if (event.data?.type === 'theme-change') {
      setTheme(event.data.theme);
      document.documentElement.setAttribute('data-theme', event.data.theme);
    }

    // 🔑 Token dal parent
    if (event.data?.type === 'ragflow-token' && event.data.token) {
      console.log('[IFRAME] SharedChat riceve token:', event.data.token);
      localStorage.setItem('Authorization', event.data.token);
      sessionStorage.setItem('Authorization', event.data.token); // extra sicurezza
    }

    // 🔒 Stato limite dal parent
    if (event.data?.type === 'limit-status') {
      // puoi salvare in state e passarlo a ChatContainer come prop
      console.log('[IFRAME] Ricevuto limit-status:', event.data.blocked);
      // esempio: setBlocked(event.data.blocked);
    }
  };

  window.addEventListener('message', handleMessage);

  // Tema iniziale
  document.documentElement.setAttribute('data-theme', theme);

  return () => {
    window.removeEventListener('message', handleMessage);
  };
}, [theme]);


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
