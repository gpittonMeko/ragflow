import React, { useRef, useState, useEffect } from 'react';
import styles from './index.less';
import { SvgLogoInteractive } from './SvgLogoInteractive';

const featureHighlight = { color: "#ffe066", fontWeight: 600 };

const PresentationPage: React.FC = () => {
  const controllerRef = useRef(new AbortController());
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return localStorage.getItem('sgai-theme') as 'light' | 'dark' || 'dark';
  });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sgai-theme', theme);
    try {
      if (iframeRef.current && iframeRef.current.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'theme-change', theme }, '*');
      }
    } catch (e) {}
  }, [theme]);

  useEffect(() => {
    const handleIframeMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'iframe-height') {
        const iframeHeight = event.data.height;
        if (iframeRef.current && iframeHeight && !isGenerating) {
          iframeRef.current.style.height = `${iframeHeight}px`;
        }
      }
      if (event.data && event.data.type === 'expand-iframe') {
        setIsGenerating(event.data.expanding);
        if (event.data.expanding && iframeRef.current) {
          const viewportHeight = window.innerHeight;
          iframeRef.current.style.height = `${viewportHeight}px`;
          iframeRef.current.style.position = 'fixed';
          iframeRef.current.style.top = '0';
          iframeRef.current.style.left = '0';
          iframeRef.current.style.width = '100%';
          iframeRef.current.style.zIndex = '1000';
          document.body.style.overflow = 'hidden';
        } else if (!event.data.expanding && iframeRef.current) {
          iframeRef.current.style.position = 'relative';
          iframeRef.current.style.top = 'auto';
          iframeRef.current.style.left = 'auto';
          iframeRef.current.style.width = '100%';
          iframeRef.current.style.zIndex = 'auto';
          document.body.style.overflow = 'auto';
          if (iframeRef.current.contentWindow) {
            try {
              iframeRef.current.contentWindow.postMessage({ type: 'request-height' }, '*');
            } catch (e) {}
          }
        }
      }
    };

    window.addEventListener('message', handleIframeMessage);
    const handleResize = () => {
      if (isGenerating && iframeRef.current) {
        const viewportHeight = window.innerHeight;
        iframeRef.current.style.height = `${viewportHeight}px`;
      } else if (iframeRef.current && iframeRef.current.contentWindow) {
        try {
          iframeRef.current.contentWindow.postMessage({ type: 'request-height' }, '*');
        } catch (e) {}
      }
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('message', handleIframeMessage);
      window.removeEventListener('resize', handleResize);
      document.body.style.overflow = 'auto';
    };
  }, [isGenerating]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className={styles.pageContainer}>
      <button
        onClick={toggleTheme}
        className={styles.themeToggle}
        style={{ zIndex: isGenerating ? '1001' : '100' }}
      >
        {theme === 'dark'
          ? <span className={styles.themeIcon}>☀️</span>
          : <span className={styles.themeIcon}>🌙</span>}
      </button>

      {/* LOGO SGAI */}
      <div
        className={styles.heroSection}
        style={{
          paddingTop: 64,
          marginBottom: '-50px',
          paddingBottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}
      >
        <SvgLogoInteractive flipped={true} />
        <div className={styles.heroSubtitle}>
    L'intelligenza artificiale per il contenzioso tributario: L'assistente legale che hai sempre desiderato
  </div>
      </div>

      {/* CHAT SOTTO IL LOGO */}
      <div className={styles.iframeSection} style={{
        overflow: isGenerating ? 'visible' : 'hidden',
        maxWidth: '100%'
      }}>
        <iframe
          ref={iframeRef}
          src="https://sgailegal.it/chat/share?shared_id=a92b7464193811f09d527ebdee58e854&from=agent&auth=lmMmVjNjNhZWExNDExZWY4YTVkMDI0Mm&visible_avatar=1"
          title="SGAI Chat Interface"
          style={{
            borderRadius: isGenerating ? '0' : 'var(--border-radius)',
            maxWidth: '100%'
          }}
        />
      </div>

      {/* FEATURE */}
      <div className={styles.featuresSection}>
        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3 style={featureHighlight}>Tutela del Knowhow</h3>
          <p style={featureHighlight}>
            Nessun dato viene acquisito.<br />
            Quel che viene discusso con SGAI è accessibile solo all'utente.
          </p>
        </div>
        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h3 style={featureHighlight}>Personalizzazione</h3>
          <p style={featureHighlight}>
            SGAI può essere potenziato per il singolo Studio professionale:<br />
            addestralo con i tuoi atti e i tuoi documenti.
          </p>
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
          <h3 style={featureHighlight}>Indipendenza e Imparzialità</h3>
          <p style={featureHighlight}>
            Lavoriamo senza legami istituzionali per garantire la massima trasparenza.
          </p>
        </div>
      </div>

      {/* DISCLAIMER */}
      <div className={styles.disclaimerSection}>
        <p><strong>Disclaimer:</strong></p>
        <p>
          Si prega di notare che SGAI è un sistema basato sull'intelligenza artificiale.
          Sebbene ci impegniamo a fornire informazioni accurate e utili, il modello può occasionalmente commettere errori o produrre informazioni non corrette. È fondamentale verificare sempre le informazioni fornite con fonti affidabili e consultare professionisti qualificati per decisioni importanti.
        </p>
      </div>
    </div>
  );
};

export default PresentationPage;