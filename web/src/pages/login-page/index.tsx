import React, { useRef, useState, useEffect } from 'react';
import styles from './index.less';
import { SvgLogoInteractive } from './SvgLogoInteractive';

const CLIENT_ID = '872236618020-3len9toeui389v3hkn4nbo198h7d5jk1c.apps.googleusercontent.com';

const featureHighlight = { color: '#ffe066', fontWeight: 600 };

const PresentationPage: React.FC = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('sgai-theme') as 'light' | 'dark') || 'dark';
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [userData, setUserData] = useState<{ email: string; plan: string; usedGenerations: number } | null>(null);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);

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
      if (data.type === 'iframe-height' && iframeRef.current && !isGenerating) {
        iframeRef.current.style.height = `${data.height}px`;
      }
      if (data.type === 'expand-iframe') {
        setIsGenerating(data.expanding);
        if (iframeRef.current) {
          if (data.expanding) {
            const viewportHeight = window.innerHeight;
            Object.assign(iframeRef.current.style, {
              height: `${viewportHeight}px`,
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
              minHeight: '600px',
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
  }, [isGenerating]);

  useEffect(() => {
    if (showGoogleModal && googleButtonRef.current && !googleToken) {
      // @ts-ignore
      if (window.google) {
        // @ts-ignore
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: handleGoogleResponse,
          cancel_on_tap_outside: true,
        });
        // @ts-ignore
        window.google.accounts.id.renderButton(googleButtonRef.current, { theme: theme === 'dark' ? 'filled_black' : 'outline', size: 'large' });
        // @ts-ignore
        window.google.accounts.id.prompt();
      }
    }
  }, [showGoogleModal, googleButtonRef.current]);

  const handleGoogleResponse = async (response: any) => {
    if (!response.credential) return;
    setGoogleToken(response.credential);
    try {
      const res = await fetch('/api/auth/google', {
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
          className={styles.themeToggle}
          style={{ right: 80, top: 20, position: 'fixed', zIndex: 1100 }}
          aria-label="Login con Google"
        >
          👤 Accedi
        </button>
      ) : (
        <>
          <div style={{ color: 'var(--text-primary)', position: 'fixed', right: 80, top: 24, zIndex: 1100, fontWeight: 600 }}>
            {userData.email} ({userData.plan})
          </div>
          <button
            onClick={logout}
            className={styles.themeToggle}
            style={{ right: 20, top: 20, position: 'fixed', zIndex: 1100 }}
            aria-label="Logout"
          >
            🚪
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
            backgroundColor: 'rgba(0,0,0,0.7)',
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
          marginTop: '2rem',
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
            minHeight: 300,
            maxHeight: 500,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            height: '100%',
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
          <h3 style={featureHighlight}>Tutela del Knowhow</h3>
          <p style={featureHighlight}>
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
          <h3 style={featureHighlight}>Personalizzazione</h3>
          <p style={featureHighlight}>
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
          <h3 style={featureHighlight}>Indipendenza e Imparzialità</h3>
          <p style={featureHighlight}>
            Lavoriamo senza legami istituzionali per garantire la massima trasparenza.
          </p>
        </div>
      </div>

      {/* DISCLAIMER */}
      <div className={styles.disclaimerSection}>
        <p>
          <strong>Disclaimer:</strong>
        </p>
        <p>
          Si prega di notare che SGAI è un sistema basato sull&apos;intelligenza artificiale. Sebbene ci impegniamo a
          fornire informazioni accurate e utili, il modello può occasionalmente commettere errori o produrre
          informazioni non corrette. È fondamentale verificare sempre le informazioni fornite con fonti affidabili e
          consultare professionisti qualificati per decisioni importanti.
        </p>
      </div>
    </div>
  );
};

export default PresentationPage;