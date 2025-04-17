import React, { useRef, useState, useEffect } from 'react';
import styles from './index.less';

const PresentationPage: React.FC = () => {
  const controllerRef = useRef(new AbortController());
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    // Ottieni il tema salvato o usa il tema predefinito 'dark'
    return localStorage.getItem('sgai-theme') as 'light' | 'dark' || 'dark';
  });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Applica il tema quando cambia
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    
    // Salva nel localStorage per condividere con l'iframe
    localStorage.setItem('sgai-theme', theme);
    
    // Tenta di inviare un messaggio all'iframe
    try {
      if (iframeRef.current && iframeRef.current.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'theme-change', theme }, '*');
      }
    } catch (e) {
      console.warn("Non è stato possibile inviare un messaggio all'iframe", e);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className={styles.pageContainer}>
      <button 
        onClick={toggleTheme} 
        className={styles.themeToggle}
      >
        {theme === 'dark' 
          ? <span className={styles.themeIcon}>☀️</span> 
          : <span className={styles.themeIcon}>🌙</span>}
      </button>

      <div className={styles.heroSection}>
        <h1 className={styles.heroTitle}>SGAI: La tua Intelligenza Artificiale per la Commercialistica Tributaria</h1>
        <p className={styles.heroSubtitle}>Semplifichiamo l'analisi e la gestione delle controversie tributarie con la potenza dell'IA.</p>
      </div>

      <div className={styles.featuresSection}>
        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3>Analisi Intelligente</h3>
          <p>Sfrutta l'IA per analizzare rapidamente accertamenti, normative e giurisprudenza.</p>
        </div>

        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h3>Gestione Efficiente</h3>
          <p>Ottimizza il tuo flusso di lavoro e prendi decisioni più informate.</p>
        </div>

        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8h1a4 4 0 010 8h-1" />
              <path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" />
              <line x1="6" y1="1" x2="6" y2="4" />
              <line x1="10" y1="1" x2="10" y2="4" />
              <line x1="14" y1="1" x2="14" y2="4" />
            </svg>
          </div>
          <h3>Indipendenza e Imparzialità</h3>
          <p>Lavoriamo senza legami istituzionali per garantire la massima trasparenza.</p>
        </div>
      </div>

      <div className={styles.iframeSection}>
        <iframe
          ref={iframeRef}
          src="https://sgailegal.it/chat/share?shared_id=a871ecb2eaba11efb3a10242ac120006&from=agent&auth=lmMmVjNjNhZWExNDExZWY4YTVkMDI0Mm"
          title="SGAI Chat Interface"
        />
      </div>

      <div className={styles.disclaimerSection}>
        <p><strong>Disclaimer:</strong></p>
        <p>Si prega di notare che SGAI è un sistema basato sull'intelligenza artificiale. Sebbene ci impegniamo a fornire informazioni accurate e utili, il modello può occasionalmente commettere errori o produrre informazioni non corrette. È fondamentale verificare sempre le informazioni fornite con fonti affidabili e consultare professionisti qualificati per decisioni importanti.</p>
      </div>
    </div>
  );
};

export default PresentationPage;