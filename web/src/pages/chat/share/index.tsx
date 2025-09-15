// File: SharedChat/index.tsx
import React, { useState, useEffect, useRef } from 'react';
import ChatContainer from './large';
import styles from './index.less';

const MAX_CHAT_HEIGHT = 1600;


const SharedChat: React.FC = () => {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('sgai-theme') || 'dark';
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // Fix input su mobile (scroll su iOS)
  useEffect(() => {
    const handleVisibilityChange = () => {
      const activeElement = document.activeElement as HTMLElement | null;
      
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
      // Altezza ridotta iniziale
      window.parent.postMessage(
        { type: 'iframe-height', height: 320 },
        '*'
      );
    }

    if (event.data?.type === 'generation-started') {
      // Espandi a viewport
      const h = window.innerHeight;
      console.log('[IFRAME] Espando a viewport:', h);
      window.parent.postMessage(
        { type: 'iframe-height', height: h },
        '*'
      );
    }

    if (event.data?.type === 'theme-change') {
      setTheme(event.data.theme);
      document.documentElement.setAttribute('data-theme', event.data.theme);
    }

    if (event.data?.type === 'ragflow-token' && event.data.token) {
      localStorage.setItem('Authorization', event.data.token);
      sessionStorage.setItem('Authorization', event.data.token);
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
  const bounded = Math.min(raw, MAX_CHAT_HEIGHT);

  window.parent.postMessage(
    { type: 'iframe-height', height: bounded },
    '*'
  );
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
