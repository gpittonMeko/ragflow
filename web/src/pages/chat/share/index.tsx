import React, { useState, useEffect } from 'react';
import ChatContainer from './large';
import styles from './index.less';

const SharedChat = () => {
  const [theme, setTheme] = useState(() => {
    // Ottieni il tema salvato in localStorage o usa il tema predefinito 'dark'
    const savedTheme = localStorage.getItem('theme');
    return savedTheme || 'dark';
  });
  
  useEffect(() => {
    // Applica il tema all'elemento HTML, così il CSS può reagire
    document.documentElement.setAttribute('data-theme', theme);
    // Salva la preferenza dell'utente
    localStorage.setItem('theme', theme);
  }, [theme]);
  
  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className={`${styles.chatWrapper} ${styles[theme]}`}>
      <button 
        onClick={toggleTheme} 
        className={styles.themeToggle}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      >
        {theme === 'dark' 
          ? <span className={styles.themeIcon}>☀️</span> 
          : <span className={styles.themeIcon}>🌙</span>}
      </button>
      <ChatContainer theme={theme}></ChatContainer>
    </div>
  );
};

export default SharedChat;