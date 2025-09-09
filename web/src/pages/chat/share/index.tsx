// File: src/pages/chat/share/index.tsx
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


  useEffect(() => {
  // 1) prendi eventuale ?auth= dall'URL e mettilo in access_token (se non già presente)
  const url = new URL(window.location.href);
  const qpAuth = url.searchParams.get('auth');
  if (qpAuth && !localStorage.getItem('access_token')) {
    localStorage.setItem('access_token', qpAuth);
  }

  // 2) assicurati che esista anche "Token" (uuid semplice)
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
      console.log('[IFRAME] Messaggio ricevuto:', event.data);

      if (event.data?.type === 'request-height' && containerRef.current) {
        const rawHeight = containerRef.current.scrollHeight;
        const boundedHeight = Math.max(
          MIN_CHAT_HEIGHT,
          Math.min(rawHeight, MAX_CHAT_HEIGHT),
        );
        console.log('[IFRAME] Invio altezza al parent:', boundedHeight);
        window.parent.postMessage(
          { type: 'iframe-height', height: boundedHeight },
          '*',
        );
      }

      if (event.data?.type === 'theme-change') {
        console.log('[IFRAME] Cambio tema →', event.data.theme);
        setTheme(event.data.theme);
        document.documentElement.setAttribute('data-theme', event.data.theme);
      }

      if (event.data?.type === 'ragflow-token' && event.data.token) {
  console.log('[IFRAME] Ricevuto token dal parent:', event.data.token);
  // salva SOLO l'access_token nel localStorage dell'IFRAME
  localStorage.setItem('access_token', event.data.token);

  // assicurati che "Token" esista
  if (!localStorage.getItem('Token')) {
    const t = (crypto?.randomUUID?.() || `${Date.now()}_${Math.random()}`)
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 32);
    localStorage.setItem('Token', t);
  }
}


      if (event.data?.type === 'limit-status') {
        console.log('[IFRAME] Stato limite ricevuto:', event.data.blocked);
        // se serve, propagalo via context/prop a ChatContainer
      }
    };

    window.addEventListener('message', handleMessage);
    document.documentElement.setAttribute('data-theme', theme);

    // se manca il token, chiedilo subito al parent
    if (!localStorage.getItem('access_token')) {
      window.parent?.postMessage({ type: 'shared-needs-token' }, '*');
    }

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
