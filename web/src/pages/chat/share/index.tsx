import React, { useState, useEffect, useRef } from 'react';
import ChatContainer from './large';
import styles from './index.less';

const SharedChat = () => {
  const [theme, setTheme] = useState(() => {
    // Ottieni il tema salvato in localStorage o usa il tema predefinito 'dark'
    return localStorage.getItem('sgai-theme') || 'dark';
  });
  
  const containerRef = useRef<HTMLDivElement>(null);
  

  const MAX_CHAT_HEIGHT = 1600; // massimo consentito (puoi cambiare)
const MIN_CHAT_HEIGHT = 350;  // minimo consentito (puoi cambiare)

  // Invia l'altezza del container al genitore quando richiesto
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'request-height') {
        if (containerRef.current) {
          const rawHeight = containerRef.current.scrollHeight;
          const boundedHeight = Math.max(MIN_CHAT_HEIGHT, Math.min(rawHeight, MAX_CHAT_HEIGHT));
          window.parent.postMessage({
            type: 'iframe-height',
            height: boundedHeight
          }, '*');
        }
      }
      
      if (event.data && event.data.type === 'theme-change') {
        setTheme(event.data.theme);
        document.documentElement.setAttribute('data-theme', event.data.theme);
      }
    };
    
    // Monitoraggio delle modifiche alle dimensioni
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === containerRef.current) {
          // Quando le dimensioni cambiano, informa il genitore
          const rawHeight = entry.target.scrollHeight;
          const boundedHeight = Math.max(MIN_CHAT_HEIGHT, Math.min(rawHeight, MAX_CHAT_HEIGHT));
          window.parent.postMessage({
            type: 'iframe-height',
            height: boundedHeight
          }, '*');
        }
      }
    });
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    window.addEventListener('message', handleMessage);
    
    // Applica il tema all'elemento HTML
    document.documentElement.setAttribute('data-theme', theme);
    
    // Funzione per leggere il tema dal localStorage
    const handleStorageChange = (event) => {
      if (event.key === 'sgai-theme' && event.newValue) {
        setTheme(event.newValue);
        document.documentElement.setAttribute('data-theme', event.newValue);
      }
    };
    
    // Aggiungi entrambi i listener per massimizzare le possibilità di successo
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('message', handleMessage);
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [theme]);

  return (
    <div className={`${styles.chatWrapper} ${styles[theme]}`} ref={containerRef}>
      <ChatContainer theme={theme}></ChatContainer>
    </div>
  );
};

export default SharedChat;