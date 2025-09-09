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

  // Bootstrap locale: salva shared_id, NON toccare più access_token con ?auth
  useEffect(() => {
    const url = new URL(window.location.href);

    // 1) salva lo shared_id per il hook (fallback se non è leggibile altrove)
    const qpShared = url.searchParams.get('shared_id');
    if (qpShared) {
      localStorage.setItem('share_shared_id', qpShared);
    }

    // 2) NON importare più ?auth in access_token: non serve per la API key RAGFlow
    // (se proprio vuoi conservarlo per debug, salvalo solo in share_auth)
    const qpAuth = url.searchParams.get('auth');
    if (qpAuth && !localStorage.getItem('share_auth')) {
      localStorage.setItem('share_auth', qpAuth);
      // nessuna scrittura su access_token / Authorization qui
    }

    // 3) assicurati che esista "Token" (uuid semplice)
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

      // salvataggio sicuro del contesto condiviso (AGENT_ID)
      if (event.data?.type === 'shared-ctx' && event.data.sharedId) {
        localStorage.setItem('share_shared_id', event.data.sharedId);
      }

      // compat retro (NON sovrascrivere mai share_auth)
      if (event.data?.type === 'ragflow-token' && event.data.token) {
        if (!localStorage.getItem('share_auth')) {
          // mantieni solo compat locale, senza toccare share_auth
          localStorage.setItem('access_token', event.data.token);
          localStorage.setItem('Authorization', event.data.token);
        }
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

    // Se vuoi ancora chiedere il token al parent per retro-compat:
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
