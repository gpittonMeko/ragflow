import React, { useState, useEffect } from 'react';
import ChatContainer from './large';
import styles from './index.less';

const SharedChat = () => {
  const [theme, setTheme] = useState('dark');
  
  // Monitora il tema del documento padre
  useEffect(() => {
    // Funzione per leggere il tema dal documento padre
    const checkTheme = () => {
      const parentTheme = document.documentElement.getAttribute('data-theme');
      if (parentTheme && (parentTheme === 'light' || parentTheme === 'dark')) {
        setTheme(parentTheme);
      }
    };
    
    // Esegui subito e poi imposta l'osservatore delle mutazioni
    checkTheme();
    
    // Crea un osservatore di attributi per il document element
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          checkTheme();
        }
      });
    });
    
    // Inizia ad osservare le modifiche all'attributo data-theme
    observer.observe(document.documentElement, { attributes: true });
    
    // Cleanup quando il componente si smonta
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`${styles.chatWrapper} ${styles[theme]}`}>
      <ChatContainer theme={theme}></ChatContainer>
    </div>
  );
};

export default SharedChat;