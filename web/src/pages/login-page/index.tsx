import React, { useRef, useState, useEffect } from 'react';
import styles from './index.less';
import { SvgLogoInteractive } from './SvgLogoInteractive';
import api from '@/utils/api'; // <-- sostituisci con il percorso reale del tuo file api
import { loadStripe } from '@stripe/stripe-js';
import { LogOut, LockKeyhole } from 'lucide-react';


const CLIENT_ID =
  '872236618020-3len9toeu389v3hkn4nbo198h7d5jk1c.apps.googleusercontent.com';


const FREE_LIMIT = 5;        //  ←  DEVE restare definito prima di qualunque uso



// chiave pubblica Stripe (ok metterla nel client)
const STRIPE_PK = 'pk_test_51RkiUbPZKD2mbdh6v8NVHrLCw5s3HCuP5CfMHn6xBJycK7YHo7L6IiwdZJPMhmuFc9nhHT6A9jbPmecxvFL7rWol00YV1QplUz';

const stripePromise = loadStripe(STRIPE_PK);

// login‑page/PresentationPage.tsx  (o dove hai il codice)
const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  window.location.origin;




declare global {
  interface Window {
    google: any;
  }
}




const PresentationPage: React.FC = () => {
  //const iframeRef = useRef<HTMLIFrameElement>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const [genCount, setGenCount] = useState<number>(() => {
  const saved = Number(localStorage.getItem('sgai-gen-count') || 0);
  return isNaN(saved) ? 0 : saved;
});

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('sgai-theme') as 'light' | 'dark') || 'dark';
  });
  //const [isGenerating, setIsGenerating] = useState(false);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  //const [hasEverGenerated, setHasEverGenerated] = useState(false);
  const [userData, setUserData] = useState<{
    email: string;
    plan: string;
    usedGenerations: number;
  } | null>(null);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  //const [hasSkippedInitialExpand, setHasSkippedInitialExpand] = useState(false);

  /* ───────── nuovo state per limitatore anonimo ───────── */
  // salva il contatore su localStorage e ripristina overlay su refresh
useEffect(() => {
  localStorage.setItem('sgai-gen-count', String(genCount));
  if (!userData && genCount >= FREE_LIMIT) setShowLimitOverlay(true);
}, [genCount, userData]);

  const [showLimitOverlay, setShowLimitOverlay] = useState(false);


  // comunica all’iframe se il limite è stato raggiunto
useEffect(() => {
  const iframe = document.querySelector<HTMLIFrameElement>(
    'iframe[title="SGAI Chat Interface"]'
  );
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage(
      { type: 'limit-status', blocked: showLimitOverlay },
      '*'
    );
  }
}, [showLimitOverlay]);


  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sgai-theme', theme);

    // Usa querySelector per trovare l'iframe senza ref React!
    const iframe = document.querySelector('iframe[title="SGAI Chat Interface"]');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'theme-change', theme }, '*');
    }
  }, [theme]);

  // Stato/flag per sapere se espandere
  const [canExpandIframe, setCanExpandIframe] = useState(false);
  const expandTimeoutRef = useRef<any>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'iframe-height') {
        const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="SGAI Chat Interface"]');
        if (!iframe) return;
        const minHeight = 400;
        const maxHeight = 1000; // se vuoi puoi mettere 1000 qui

        let nextHeight = event.data.height;

        // Se non puoi ancora espandere, rimani al minimo
        if (!canExpandIframe) {
          // Se la prima generazione supera 400px (o la tua soglia), parte il timeout
          if (nextHeight > minHeight && !expandTimeoutRef.current) {
            expandTimeoutRef.current = setTimeout(() => {
              setCanExpandIframe(true);
              expandTimeoutRef.current = null;
            }, 10000); // 10 secondi
          }
          // Intanto l'iframe rimane minimo
          nextHeight = minHeight;
        } else {
          // Puoi espandere normalmente (dopo 10 sec)
          nextHeight = Math.max(nextHeight, minHeight);
          nextHeight = Math.min(nextHeight, maxHeight);
        }

        iframe.style.height = `${nextHeight}px`;
      }

      /* ───────── nuovo blocco: intercetta fine generazione ───────── */
      if (event.data?.type === 'generation-finished') {
        if (!userData) {
          setGenCount(prev => {
            const next = prev + 1;
            if (next >= FREE_LIMIT) setShowLimitOverlay(true);
            return next;
          });
        }
      }
    };

    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current);
    };
  }, [canExpandIframe, userData]);
  //
  //
  //
  //  useEffect(() => {
  //    const handleIframeMessage = (event: MessageEvent) => {
  //      const data = event.data || {};
  //
  //      if (data.type === 'iframe-height' && iframeRef.current) {
  //        let min = 200;
  //        let max = 1600;
  //        let boundedHeight = Math.max(min, Math.min(data.height, max));
  //        console.log("SGAI [parent]: data.height ricevuta:", data.height, "-> usata:", boundedHeight);
  //        iframeRef.current.style.height = `${boundedHeight}px`;
  //        iframeRef.current.style.minHeight = `${min}px`;
  //        iframeRef.current.style.maxHeight = `${max}px`;
  //      }
  //
  //      if (data.type === 'expand-iframe') {
  //        if (data.expanding) {
  //          if (!hasSkippedInitialExpand) {
  //            setHasSkippedInitialExpand(true);
  //            return;
  //          }
  //        }
  //
  //        setIsGenerating(data.expanding);
  //
  //        if (data.expanding && !hasEverGenerated) {
  //          setHasEverGenerated(true);
  //        }
  //
  //        if (iframeRef.current) {
  //          if (data.expanding) {
  //            Object.assign(iframeRef.current.style, {
  //              maxHeight: '800px',
  //              height: `${window.innerHeight}px`,
  //              position: 'fixed',
  //              top: '0',
  //              left: '0',
  //              width: '100%',
  //              zIndex: '1000',
  //            });
  //            document.body.style.overflow = 'hidden';
  //          } else {
  //            Object.assign(iframeRef.current.style, {
  //              position: 'relative',
  //              top: 'auto',
  //              left: 'auto',
  //              width: '100%',
  //              zIndex: 'auto',
  //              height: 'auto',
  //              minHeight: '200px',
  //              maxHeight: '800px',
  //            });
  //            document.body.style.overflow = 'auto';
  //            if (iframeRef.current.contentWindow) {
  //              try {
  //                iframeRef.current.contentWindow.postMessage({ type: 'request-height' }, '*');
  //              } catch {}
  //            }
  //          }
  //        }
  //      }
  //    };
  //
  //    window.addEventListener('message', handleIframeMessage);
  //    return () => {
  //      window.removeEventListener('message', handleIframeMessage);
  //      document.body.style.overflow = 'auto';
  //    };
  //  }, [isGenerating, hasSkippedInitialExpand]);
  //
  //// Stato per indicare se SDK è pronto
  const [gsiReady, setGsiReady] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sgai-theme', theme);

    // Invia il tema all’iframe, se presente
    const iframe = document.querySelector('iframe[title="SGAI Chat Interface"]');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'theme-change', theme }, '*');
    }
  }, [theme]);

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
    script.src = 'https://accounts.google.com/gsi/client';
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
        /* ─── reset limite anonimo ─── */
        setGenCount(0);
        localStorage.removeItem('sgai-gen-count');   // <─ reset anche storage
        setShowLimitOverlay(false);

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
    setGenCount(0);
    localStorage.removeItem('sgai-gen-count');
  };


  // prima: prendeva solo "premium" ed usava userData?.email
  // dopo: accetta il piano e passa l'email solo se c’è
  const handleCheckout = async (plan: 'standard' | 'premium' = 'premium') => {
    try {
      const stripe = await stripePromise;
      if (!stripe) throw new Error('Stripe non caricato');

      const res = await fetch(`${API_BASE}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userData?.email ?? null,
          selected_plan: plan,
        }),
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Errore server Stripe');   // ←  mostra l’errore vero

      const { sessionId } = payload;
      if (!sessionId) throw new Error('Session ID mancante dal backend');

      const { error: stripeErr } = await stripe.redirectToCheckout({ sessionId });
      if (stripeErr) alert(stripeErr.message);
    } catch (err: any) {
      alert(err.message || 'Errore checkout Stripe');
    }
  };





  return (
    <div className={styles.pageContainer}>
      {/* Toggle tema */}
      <button onClick={toggleTheme} className={styles.themeToggle} style={{ zIndex: 1100 }} aria-label="Toggle Theme">
        {theme === 'dark' ? <span className={styles.themeIcon}>☀️</span> : <span className={styles.themeIcon}>🌙</span>}
      </button>


  {/* Pulsante login + contatore oppure dati utente */}
{!userData ? (
  <>
    {/* --- Google button stile ufficiale --- */}
    <button
    onClick={() => setShowGoogleModal(true)}
    className={styles.glassBtn}
    style={{position:'fixed',right:80,top:20,zIndex:1100}}
    aria-label="Accedi con Google"
  >
    <img
       src="https://developers.google.com/identity/images/g-logo.png?sz=40"
      alt=""
      style={{width:18,marginRight:8,verticalAlign:'middle'}}
    />
    Accedi con Google
  </button>




    {/* --- “pill” del contatore --- */}
    <div
      style={{
        position: 'fixed',
        right: 80,
        top: 70,
        zIndex: 1100,
        background: 'linear-gradient(135deg,#4285F4,#34A853)',
        color: '#fff',
        padding: '3px 12px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        boxShadow: '0 0 6px rgba(0,0,0,.25)',
      }}
    >
      {Math.max(FREE_LIMIT - genCount, 0)} / {FREE_LIMIT}
    </div>
  </>
) : (
  <>
    <div
      style={{
        position: 'fixed',
        right: 80,
        top: 26,
        zIndex: 1100,
        fontWeight: 600,
        color: 'var(--text-primary)',
      }}
    >
      {userData.email} ({userData.plan})
    </div>
    {/* 🔽 ECCO QUI */}

        {userData && userData.plan !== 'premium'  && (
        <button
          onClick={() => handleCheckout('premium')}
          className={`${styles.glassBtn} ${styles.upgradeBtn}`}
          style={{position:'fixed',right:80,top:110,zIndex:1100}}
          aria-label="Passa a Premium"
        >
          🔓 Passa a Premium
        </button>

      )}


    /* logout */
    <button
      onClick={logout}
      className={styles.glassBtn}
      style={{ position:'fixed', right:20, top:20, zIndex:1100,
              background:'rgba(255,80,80,.25)' }}
      aria-label="Logout"
    >
      <LogOut size={18} className={styles.icon} />
      &nbsp;Esci
    </button>

/* upgrade */
/* logout */
<button
  onClick={logout}
  className={styles.glassBtn}
  style={{ position:'fixed', right:20, top:20, zIndex:1100,
           background:'rgba(255,80,80,.25)' }}
  aria-label="Logout"
>
  <LogOut size={18} className={styles.icon} />
  &nbsp;Esci
</button>

/* upgrade */
{userData?.plan !== 'premium' && (
  <button
    onClick={() => handleCheckout('premium')}
    className={`${styles.glassBtn} ${styles.upgradeBtn}`}
    style={{ position:'fixed', right:80, top:110, zIndex:1100 }}
    aria-label="Passa a Premium"
  >
    <LockKeyhole size={18} className={styles.icon} />
    &nbsp;Passa&nbsp;a&nbsp;Premium
  </button>
)}



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
               backgroundColor: '#fff',
               padding: '2rem 2.5rem 2.5rem',    // ↑ più spazio in basso
               borderRadius: 'var(--border-radius)',
               boxShadow: 'var(--shadow)',
               width: '320px',
               textAlign: 'center',
               color: '#000',
               userSelect: 'none',
               display: 'flex',
               flexDirection: 'column',
               gap: '1.25rem',                  // ← spazio costante fra elemento
             }}
           >
            <h2>Accedi con Google</h2>
            <div ref={googleButtonRef} />
            <button onClick={() => setShowGoogleModal(false)} style={{ marginTop: '1rem' }} aria-label="Chiudi">
              Annulla
            </button>
          </div>


          
    <button
    onClick={() => handleCheckout('premium')}
    className={styles.upgradeBtn}
    aria-label="Acquista Premium"
    style={{ marginTop: 12 }}
  >
    🔓 Passa direttamente a Premium
  </button>

  
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
      </div>
      {/* CHAT SOTTO IL LOGO */}
      <div className={styles.iframeSection}>
        <iframe
          src="http://16.170.85.194/chat/share?shared_id=9afb6a2267bf11f0a1f2fec73c0cd884&from=agent&auth=diODc1MmRlNmJjMzExZjA5OTFjYzI5Zj&visible_avatar=1"
          title="SGAI Chat Interface"
          style={{
            borderRadius: 'var(--border-radius)',
            width: '100%',
            minHeight: 350,
            maxHeight: 1600, // opzionale se vuoi fermare a max
            border: 'none',
            display: 'block',
            background: 'transparent',
          }}
          allow="clipboard-write" // opzionale
        />
      </div>

      {/* ─────────── overlay di blocco se superato il limite ─────────── */}
      {showLimitOverlay && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1500,
            color: '#fff',
            textAlign: 'center',
            padding: '2rem',
          }}
        >
          <div
            style={{
              background: 'rgba(30,30,30,0.85)',
              borderRadius: 12,
              padding: '2rem',
              maxWidth: 420,
            }}
          >
            <h2 style={{ marginTop: 0 }}>
              Hai esaurito le {FREE_LIMIT} generazioni gratuite
            </h2>
            <p>Per continuare effettua l’accesso con Google.</p>
            <button
          onClick={() => setShowGoogleModal(true)}
          className={styles.glassBtn}
          style={{ position:'fixed', right:80, top:20, zIndex:1100 }}
          aria-label="Accedi con Google"
        >
          {/* logo ufficiale – sfondo trasparente, retina‑ready */}
          <svg viewBox="0 0 256 262" width="18" height="18" className={styles.icon}>
            <path fill="#4285F4" d="M255.9 133.5c0-11.5-1-23.1-3.2-34.2H130v64.8h70.8c-3.1 17-12.7 31.4-27 41.2l43.6 34.2c25.5-23.5 40.5-58.3 40.5-106z"/>
            <path fill="#34A853" d="M130 262c36.7 0 67.6-12.1 90.2-32.8l-43.6-34.2c-12.1 8.3-27.6 13.2-46.6 13.2-35.8 0-66.2-24.1-77-56.8l-45 34.7c22.7 44.4 69.3 75.9 122 75.9z"/>
            <path fill="#FBBC05" d="M53 151.4c-2.9-8.4-4.6-17.4-4.6-26.4s1.7-18 4.6-26.4l-45-34.7C3 85.5 0 101.2 0 125s3 39.5 8 61.1l45-34.7z"/>
            <path fill="#EA4335" d="M130 49.8c20 0 38 6.9 52.1 20.4l39-39C199.3 11 166.6 0 130 0 77.3 0 30.7 31.5 8 75.9l45 34.7C63.8 73.9 94.2 49.8 130 49.8z"/>
          </svg>
          Accedi&nbsp;con&nbsp;Google
        </button>

          </div>
        </div>
      )}

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
          Il sistema viene aggiornato costantemente, con l’integrazione progressiva di nuove fonti,
          funzionalità e affinamenti della logica. Se oggi non trovi quello che cerchi, è possibile che domani ci sia.
          Pur puntando alla massima accuratezza, invitiamo a verificare sempre i contenuti con fonti ufficiali e a consultare professionisti qualificati per ogni decisione rilevante.
        </p>
      </div>
    </div>
  );
};

export default PresentationPage;