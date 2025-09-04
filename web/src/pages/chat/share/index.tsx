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

  // Gestione messaggi dal parent (altezza e tema)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
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

      if (event.data?.type === 'theme-change') {
        setTheme(event.data.theme);
        document.documentElement.setAttribute('data-theme', event.data.theme);
      }
    };

    // ResizeObserver → invia al parent se la chat cresce/diminuisce
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === containerRef.current) {
          const boundedHeight = Math.max(
            MIN_CHAT_HEIGHT,
            Math.min(entry.target.scrollHeight, MAX_CHAT_HEIGHT)
          );
          window.parent.postMessage(
            { type: 'iframe-height', height: boundedHeight },
            '*'
          );
        }
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('message', handleMessage);

    // Tema iniziale
    document.documentElement.setAttribute('data-theme', theme);

    // Listener per cambiamenti in localStorage (tema cambiato altrove)
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'sgai-theme' && event.newValue) {
        setTheme(event.newValue);
        document.documentElement.setAttribute('data-theme', event.newValue);
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('message', handleMessage);
      if (containerRef.current) resizeObserver.unobserve(containerRef.current);
      resizeObserver.disconnect();
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
