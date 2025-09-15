// File: SharedChat/index.tsx
import React, { useState, useEffect, useRef } from 'react';
import ChatContainer from './large';
import styles from './index.less';

const COLLAPSED_H = 200; // altezza iniziale compatta

const SharedChat: React.FC = () => {
  const [theme, setTheme] = useState(() => localStorage.getItem('sgai-theme') || 'dark');
  const [expanded, setExpanded] = useState(false); // stato chat: compatta/espansa
  const containerRef = useRef<HTMLDivElement>(null);

  // helper per inviare l'altezza al parent con clamp alla viewport
  const postHeight = (h: number) => {
    const safe = Math.min(h, window.innerHeight); // mai oltre la viewport dell'iframe
    window.parent.postMessage({ type: 'iframe-height', height: safe }, '*');
  };

  // Eventi dal parent
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;

      if (data?.type === 'request-height') {
        setExpanded(false);
        postHeight(COLLAPSED_H);
      }

      if (data?.type === 'generation-started') {
        setExpanded(true);
        postHeight(window.innerHeight);
      }

      if (data?.type === 'theme-change') {
        setTheme(data.theme);
        document.documentElement.setAttribute('data-theme', data.theme);
      }

      if (data?.type === 'ragflow-token' && data.token) {
        localStorage.setItem('Authorization', data.token);
        sessionStorage.setItem('Authorization', data.token);
      }
    };

    window.addEventListener('message', handleMessage);
    document.documentElement.setAttribute('data-theme', theme);

    // Altezza iniziale di sicurezza anche se il parent non invia "request-height"
    postHeight(COLLAPSED_H);

    return () => window.removeEventListener('message', handleMessage);
  }, [theme]);

  // Mantieni la dimensione corretta al resize
  useEffect(() => {
    const onResize = () => {
      postHeight(expanded ? window.innerHeight : COLLAPSED_H);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [expanded]);

  return (
    <div className={`${styles.chatWrapper} ${styles[theme]}`} ref={containerRef}>
      <ChatContainer theme={theme} />
    </div>
  );
};

export default SharedChat;
