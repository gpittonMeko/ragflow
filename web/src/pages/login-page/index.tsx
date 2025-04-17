import React, { useState, useEffect } from 'react';

// Importing styles
// Note: We're assuming the styles will be imported from a different file
// You'll need to create this file with the CSS provided below

const PresentationPage = () => {
  const [theme, setTheme] = useState('dark');
  
  // Apply theme on initial load and when theme changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    // Store user preference in local storage
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="page-container">
      <button 
        onClick={toggleTheme} 
        className="theme-toggle"
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      >
        {theme === 'dark' 
          ? <span className="theme-icon">☀️</span> 
          : <span className="theme-icon">🌙</span>}
      </button>

      <div className="hero-section">
        <h1 className="hero-title">SGAI: La tua Intelligenza Artificiale per la Commercialistica Tributaria</h1>
        <p className="hero-subtitle">Semplifichiamo l'analisi e la gestione delle controversie tributarie con la potenza dell'IA.</p>
      </div>

      <div className="features-section">
        <div className="feature-card">
          <div className="feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3>Analisi Intelligente</h3>
          <p>Sfrutta l'IA per analizzare rapidamente accertamenti, normative e giurisprudenza.</p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h3>Gestione Efficiente</h3>
          <p>Ottimizza il tuo flusso di lavoro e prendi decisioni più informate.</p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">
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

      <div className="iframe-section">
        <iframe
          src="https://sgailegal.it/chat/share?shared_id=a871ecb2eaba11efb3a10242ac120006&from=agent&auth=lmMmVjNjNhZWExNDExZWY4YTVkMDI0Mm"
          title="SGAI Chat Interface"
        />
      </div>

      <div className="disclaimer-section">
        <p><strong>Disclaimer:</strong></p>
        <p>Si prega di notare che SGAI è un sistema basato sull'intelligenza artificiale. Sebbene ci impegniamo a fornire informazioni accurate e utili, il modello può occasionalmente commettere errori o produrre informazioni non corrette. È fondamentale verificare sempre le informazioni fornite con fonti affidabili e consultare professionisti qualificati per decisioni importanti.</p>
      </div>
    </div>
  );
};

export default PresentationPage;