import React, { useState, useEffect } from 'react';
import ChatContainer from './large';
import styles from './index.less';

const SharedChat = () => {
  const [theme, setTheme] = useState(() => {
    // Ottieni il tema salvato in localStorage o usa il tema predefinito 'dark'
    return localStorage.getItem('sgai-theme') || 'dark';
  });
  
  useEffect(() => {
    // Applica il tema all'elemento HTML
    document.documentElement.setAttribute('data-theme', theme);
    
    // Funzione per leggere il tema dal localStorage
    const handleStorageChange = (event) => {
      if (event.key === 'sgai-theme' && event.newValue) {
        setTheme(event.newValue);
        document.documentElement.setAttribute('data-theme', event.newValue);
      }
    };
    
    // Ascolta i messaggi dalla pagina principale
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'theme-change') {
        setTheme(event.data.theme);
        document.documentElement.setAttribute('data-theme', event.data.theme);
      }
    };
    
    // Aggiungi entrambi i listener per massimizzare le possibilità di successo
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('message', handleMessage);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  return (
    <div className={`${styles.chatWrapper} ${styles[theme]}`}>
      <ChatContainer theme={theme}></ChatContainer>
    </div>
  );
};

export default SharedChat;