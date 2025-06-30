import React, { useRef, useState, useEffect } from 'react';
import styles from './index.less';
import { SvgLogoInteractive } from './SvgLogoInteractive';
import api from '@/utils/api'; // <-- sostituisci con il percorso reale del tuo file api

const CLIENT_ID = '872236618020-3len9toeu389v3hkn4nbo198h7d5jk1c.apps.googleusercontent.com';

const PresentationPage: React.FC = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('sgai-theme') as 'light' | 'dark') || 'dark';
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [hasEverGenerated, setHasEverGenerated] = useState(false);
  const [userData, setUserData] = useState<{ email: string; plan: string; usedGenerations: number } | null>(null);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [hasSkippedInitialExpand, setHasSkippedInitialExpand] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sgai-theme', theme);
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'theme-change', theme }, '*');
    }
  }, [theme]);



  useEffect(() => {
    const handleIframeMessage = (event: MessageEvent) => {
      const data = event.data || {};

      if (data.type === 'iframe-height' && iframeRef.current) {
        // Allunga dinamicamente l'iframe fino a 1600px
        let boundedHeight = Math.max(100, Math.min(data.height, 1600));
        iframeRef.current.style.height = `${boundedHeight}px`;
        iframeRef.current.style.maxHeight = '1600px';
      }

      if (data.type === 'expand-iframe') {
        if (data.expanding) {
          if (!hasSkippedInitialExpand) {
            setHasSkippedInitialExpand(true);
            return;
          }
        }

        setIsGenerating(data.expanding);

        if (data.expanding && !hasEverGenerated) {
          setHasEverGenerated(true);
        }

        if (iframeRef.current) {
          if (data.expanding) {
            Object.assign(iframeRef.current.style, {
              maxHeight: '800px',
              height: `${window.innerHeight}px`,
              position: 'fixed',
              top: '0',
              left: '0',
              width: '100%',
              zIndex: '1000',
            });
            document.body.style.overflow = 'hidden';
          } else {
            Object.assign(iframeRef.current.style, {
              position: 'relative',
              top: 'auto',
              left: 'auto',
              width: '100%',
              zIndex: 'auto',
              height: 'auto',
              minHeight: '200px',
              maxHeight: '800px',
            });
            document.body.style.overflow = 'auto';
            if (iframeRef.current.contentWindow) {
              try {
                iframeRef.current.contentWindow.postMessage({ type: 'request-height' }, '*');
              } catch {}
            }
          }
        }
      }
    };

    window.addEventListener('message', handleIframeMessage);
    return () => {
      window.removeEventListener('message', handleIframeMessage);
      document.body.style.overflow = 'auto';
    };
  }, [isGenerating, hasSkippedInitialExpand]);

// Stato per indicare se SDK è pronto
  const [gsiReady, setGsiReady] = useState(false);

  useEffect(() => {
  if (!showGoogleModal || !googleButtonRef.current || googleToken || !gsiReady) return;

  window.google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: handleGoogleResponse,
    cancel_on_tap_outside: true,
  });

  window.google.accounts.id.renderButton(googleButtonRef.current, {
    theme: theme === 'dark' ? 'filled_black' : 'outline',
    size: 'large',
    type: 'standard',
  });

  window.google.accounts.id.prompt();
}, [showGoogleModal, gsiReady, googleToken, theme]);

  useEffect(() => {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      setGsiReady(true);
      return;
    }

    const script = document.createElement('script');
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setGsiReady(true);
    document.body.appendChild(script);

    // NON rimuovere lo script al cleanup
  }, []);

  const handleGoogleResponse = async (response: any) => {
    if (!response.credential) return;
    setGoogleToken(response.credential);
    try {
      const res = await fetch(api.googleAuth, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: response.credential }),
      });
      const data = await res.json();
      if (res.ok) {
        setUserData(data);
        setShowGoogleModal(false);
      } else {
        alert(`Errore di autenticazione: ${data.error || 'sconosciuto'}`);
        setGoogleToken(null);
      }
    } catch {
      alert('Errore di rete durante autenticazione');
      setGoogleToken(null);
    }
  };

  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  const logout = () => {
    setGoogleToken(null);
    setUserData(null);
  };

  return (
    <div className={styles.pageContainer}>
      {/* Toggle tema */}
      <button onClick={toggleTheme} className={styles.themeToggle} style={{ zIndex: 1100 }} aria-label="Toggle Theme">
        {theme === 'dark' ? <span className={styles.themeIcon}>☀️</span> : <span className={styles.themeIcon}>🌙</span>}
      </button>

      {/* Pulsante login / user info */}
      {!userData ? (
        <button
          onClick={() => setShowGoogleModal(true)}
          className={styles.loginButton}
          aria-label="Login con Google"
          type="button"
          style={{
            position: 'fixed',
            right: 80,
            top: 20,
            zIndex: 1100,
            backgroundColor: '#fff',
            color: '#222',
            borderRadius: '8px',
            padding: '10px 16px',
            fontWeight: 600,
            border: '1px solid #ccc',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
          }}
        >
          👤 Accedi con Google
        </button>
      ) : (
        <>
          <div
            className={styles.userInfo}
            style={{
              position: 'fixed',
              right: 80,
              top: 24,
              zIndex: 1100,
              color: 'var(--text-primary)',
              fontWeight: 600,
            }}
          >
            {userData.email} ({userData.plan})
          </div>
          <button
            onClick={logout}
            className={styles.logoutButton}
            aria-label="Logout"
            type="button"
            style={{
              position: 'fixed',
              right: 20,
              top: 20,
              zIndex: 1100,
              backgroundColor: '#ff4d4f',
              color: '#fff',
              border: 'none',
              padding: '10px 16px',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(255, 77, 79, 0.6)',
            }}
          >
            🚪 Esci
          </button>
        </>
      )}

      {/* Google auth modal popup */}
      {showGoogleModal && (
        <div
          onClick={() => setShowGoogleModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.85)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1200,
          }}
          aria-modal="true"
          role="dialog"
          tabIndex={-1}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--card-bg)',
              padding: '2rem',
              borderRadius: 'var(--border-radius)',
              boxShadow: 'var(--shadow)',
              width: '320px',
              textAlign: 'center',
              color: 'var(--text-primary)',
              userSelect: 'none',
            }}
          >
            <h2>Accedi con Google</h2>
            <div ref={googleButtonRef} />
            <button onClick={() => setShowGoogleModal(false)} style={{ marginTop: '1rem' }} aria-label="Chiudi">
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* LOGO SGAI */}
      <div
        className={styles.heroSection}
        style={{
          paddingTop: 0,
          marginBottom: '-1rem',
          marginTop: 0,
          paddingBottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}
      >
        <div style={{ marginBottom: '2rem', width: '100%', maxWidth: '320px' }}>
          <SvgLogoInteractive flipped />
        </div>
        <div className={styles.heroSubtitle} style={{ maxWidth: '600px', textAlign: 'center' }}>
          L'intelligenza artificiale per il contenzioso tributario: L&apos;assistente legale che hai sempre desiderato
        </div>
      </div>

      {/* CHAT SOTTO IL LOGO */}
      <div
        className={styles.iframeSection}
        style={{
          overflow: isGenerating ? 'visible' : 'hidden',
          maxWidth: '100%',
        }}
      >
        <iframe
          ref={iframeRef}
          src="https://sgailegal.it/chat/share?shared_id=a92b7464193811f09d527ebdee58e854&from=agent&auth=lmMmVjNjNhZWExNDExZWY4YTVkMDI0Mm&visible_avatar=1"
          title="SGAI Chat Interface"
          style={{
            borderRadius: isGenerating ? '0' : 'var(--border-radius)',
            maxWidth: '100%',
            minHeight: 200,
            maxHeight: 350,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            border: 'none',
          }}
        />
      </div>

      {/* FEATURE */}
      <div className={styles.featuresSection}>
        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3 className={styles.featureHighlight}>Tutela del Knowhow</h3>
          <p className={styles.featureHighlight}>
            Nessun dato viene acquisito.
            <br />
            Quel che viene discusso con SGAI è accessibile solo all&apos;utente.
          </p>
        </div>
        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h3 className={styles.featureHighlight}>Personalizzazione</h3>
          <p className={styles.featureHighlight}>
            SGAI può essere potenziato per il singolo Studio professionale:
            <br />
            addestralo con i tuoi atti e i tuoi documenti.
          </p>
        </div>
        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8h1a4 4 0 010 8h-1" />
              <path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" />
              <line x1="6" y1="1" x2="6" y2="4" />
              <line x1="10" y1="1" x2="10" y2="4" />
              <line x1="14" y1="1" x2="14" y2="4" />
            </svg>
          </div>
          <h3 className={styles.featureHighlight}>Indipendenza e Imparzialità</h3>
          <p className={styles.featureHighlight}>
            SGAI non ha legami istituzionali per garantire la massima trasparenza
          </p>
        </div>
      </div>

      <div className={styles.disclaimerSection}>
        <p>
          <strong>Disclaimer:</strong>
        </p>
        <p>
          SGAI è un sistema in fase di sviluppo, basato sull’intelligenza artificiale. Lo sappiamo: non è ancora completo, e talvolta può fornire risposte inesatte, parziali o incoerenti. Ma è proprio grazie all’uso quotidiano e al supporto degli utenti che il progetto può evolversi e migliorare.
          {' '}
          Il sistema viene aggiornato costantemente, con l’integrazione progressiva di nuove fonti,
          funzionalità e affinamenti della logica. Se oggi non trovi quello che cerchi, è possibile che domani ci sia.
          {' '}
          Pur puntando alla massima accuratezza, invitiamo a verificare sempre i contenuti con fonti ufficiali e a consultare professionisti qualificati per ogni decisione rilevante.
        </p>
      </div>
    </div>
  );
};

export default PresentationPage;