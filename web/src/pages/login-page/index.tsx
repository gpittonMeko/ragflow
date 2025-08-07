import React, { useRef, useState, useEffect } from 'react';
import styles from './index.less';
import { SvgLogoInteractive } from './SvgLogoInteractive';
import api from '@/utils/api'; // <-- percorso reale del tuo file api
import { loadStripe } from '@stripe/stripe-js';
import { LogOut,LockKeyhole,BadgeDollarSign, Sun, Moon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const CLIENT_ID =
  '872236618020-3len9toeu389v3hkn4nbo198h7d5jk1c.apps.googleusercontent.com';

const FREE_LIMIT = 5; // fallback visuale

// chiave pubblica Stripe (ok metterla nel client)
const STRIPE_PK = 'pk_test_51RkiUbPZKD2mbdh6v8NVHrLCw5s3HCuP5CfMHn6xBJycK7YHo7L6IiwdZJPMhmuFc9nhHT6A9jbPmecxvFL7rWol00YV1QplUz';
const stripePromise = loadStripe(STRIPE_PK);

// --- base URL backend ---
const baseURL =
  (process.env.UMI_APP_API_BASE as string | undefined) ??
  window.location.origin;

/* --- mini-component per la “G” trasparente --- */
const GoogleGIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg
    viewBox="0 0 256 262"
    width={size}
    height={size}
    aria-hidden="true"
    style={{ verticalAlign: 'middle' }}
  >
    <path fill="#4285F4" d="M255.9 133.5c0-11.5-1-23.1-3.2-34.2H130v64.8h70.8c-3.1 17-12.7 31.4-27 41.2l43.6 34.2c25.5-23.5 40.5-58.3 40.5-106z"/>
    <path fill="#34A853" d="M130 262c36.7 0 67.6-12.1 90.2-32.8l-43.6-34.2c-12.1 8.3-27.6 13.2-46.6 13.2-35.8 0-66.2-24.1-77-56.8l-45 34.7c22.7 44.4 69.3 75.9 122 75.9z"/>
    <path fill="#FBBC05" d="M53 151.4c-2.9-8.4-4.6-17.4-4.6-26.4s1.7-18 4.6-26.4l-45-34.7C3 85.5 0 101.2 0 125s3 39.5 8 61.1l45-34.7z"/>
    <path fill="#EA4335" d="M130 49.8c20 0 38 6.9 52.1 20.4l39-39C199.3 11 166.6 0 130 0 77.3 0 30.7 31.5 8 75.9l45 34.7C63.8 73.9 94.2 49.8 130 49.8z"/>
  </svg>
);

declare global {
  interface Window {
    google: any;
  }
}

/* ------------- TIPI QUOTA ------------- */
type QuotaAnon = {
  scope: 'anon';
  id: string;
  plan: 'anon';
  usedTotal: number;
  totalLimit: number;
  remainingTotal: number;
};

type QuotaUser = {
  scope: 'user';
  id: string;           // email
  plan: 'free' | 'premium';
  usedToday: number;
  dailyLimit: number;
  remainingToday: number;
  day: string;
};

function getOrCreateClientId(): string {
  let id = localStorage.getItem('sgai-client-id');
  if (!id) {
    id = uuidv4();
    localStorage.setItem('sgai-client-id', id);
  }
  return id;
}

const PresentationPage: React.FC = () => {
  const googleButtonRef = useRef<HTMLDivElement>(null);

  // contatore legacy locale (lo lasciamo ma ora fa solo da fallback UI)
  const [genCount, setGenCount] = useState<number>(() => {
    const saved = Number(localStorage.getItem('sgai-gen-count') || 0);
    return isNaN(saved) ? 0 : saved;
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('sgai-theme') as 'light' | 'dark') || 'dark';
  });

  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [userData, setUserData] = useState<{
    email: string;
    plan: string;
    usedGenerations?: number;
  } | null>(null);

  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [showLimitOverlay, setShowLimitOverlay] = useState(false);

  // quota server-side
  const [quota, setQuota] = useState<QuotaAnon | QuotaUser | null>(null);
  const clientIdRef = useRef<string>(getOrCreateClientId());

  // salva legacy contatore
  useEffect(() => {
    localStorage.setItem('sgai-gen-count', String(genCount));
    // overlay legacy (fallback) — resta, ma ora la logica principale usa quota
    if (!userData && genCount >= FREE_LIMIT) setShowLimitOverlay(true);
  }, [genCount, userData]);

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

  // tema + sync a iframe
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sgai-theme', theme);
    const iframe = document.querySelector('iframe[title="SGAI Chat Interface"]');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'theme-change', theme }, '*');
    }
  }, [theme]);

  // espansione iframe
  const [canExpandIframe, setCanExpandIframe] = useState(false);
  const expandTimeoutRef = useRef<any>(null);

  // ======= FUNZIONI QUOTA =======
  async function refreshQuota() {
    try {
      const headers: Record<string, string> = {};
      if (googleToken) headers['Authorization'] = `Bearer ${googleToken}`;
      else headers['X-Client-Id'] = clientIdRef.current;

      const res = await fetch(`${baseURL}/api/quota`, { headers });
      const data = await res.json();
      console.log('[QUOTA]', data); 
      if (res.ok) {
        setQuota(data);
        // decidi overlay in base alla quota
        if (data.scope === 'anon') {
          setShowLimitOverlay((data as QuotaAnon).remainingTotal <= 0);
        } else if (data.scope === 'user') {
          const q = data as QuotaUser;
          setShowLimitOverlay(q.plan !== 'premium' && q.remainingToday <= 0);
        }
      } else {
        console.warn('quota error', data);
      }
    } catch (e) {
      console.warn('quota network error', e);
    }
  }

  async function tickGeneration() {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (googleToken) headers['Authorization'] = `Bearer ${googleToken}`;
      else headers['X-Client-Id'] = clientIdRef.current;

      const res = await fetch(`${baseURL}/api/generate`, { method: 'POST', headers });
      const data = await res.json();
      if (!res.ok) {
        await refreshQuota();
        alert(data?.error || 'Limite raggiunto');
        return false;
      }
      // ok → sync quota
      await refreshQuota();
      return true;
    } catch (e) {
      console.error('generate error', e);
      return false;
    }
  }

  // ======= LISTENER postMessage (altezza + fine generazione) =======
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'iframe-height') {
        const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="SGAI Chat Interface"]');
        if (!iframe) return;
        const minHeight = 400;
        const maxHeight = 1000;
        let nextHeight = event.data.height;

        if (!canExpandIframe) {
          if (nextHeight > minHeight && !expandTimeoutRef.current) {
            expandTimeoutRef.current = setTimeout(() => {
              setCanExpandIframe(true);
              expandTimeoutRef.current = null;
            }, 10000);
          }
          nextHeight = minHeight;
        } else {
          nextHeight = Math.max(nextHeight, minHeight);
          nextHeight = Math.min(nextHeight, maxHeight);
        }

        iframe.style.height = `${nextHeight}px`;
      }

      // FINE GENERAZIONE → conteggio lato server
      if (event.data?.type === 'generation-finished') {
        // fallback legacy locale (non blocca mai da solo)
        if (!userData) {
          setGenCount(prev => {
            const next = prev + 1;
            if (next >= FREE_LIMIT) setShowLimitOverlay(true);
            return next;
          });
        }
        // conteggio ufficiale lato server
        void tickGeneration();
      }
    };

    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current);
    };
  }, [canExpandIframe, userData, googleToken]);

  // ======= GOOGLE SDK =======
  const [gsiReady, setGsiReady] = useState(false);

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
        // reset legacy locale
        setGenCount(0);
        localStorage.removeItem('sgai-gen-count');
        setShowLimitOverlay(false);
        await refreshQuota(); // <— sync quota loggato
      } else {
        alert(`Errore di autenticazione: ${data.error || 'sconosciuto'}`);
        setGoogleToken(null);
      }
    } catch {
      alert('Errore di rete durante autenticazione');
      setGoogleToken(null);
    }
  };

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

  // all'avvio e quando cambia token → allinea quota
  useEffect(() => {
    void refreshQuota();
  }, [googleToken]);

  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  const logout = () => {
    setGoogleToken(null);
    setUserData(null);
    setGenCount(0);
    localStorage.removeItem('sgai-gen-count');
    // dopo logout torni anonimo → ricalcola quota anon
    void refreshQuota();
  };

  // Stripe
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  const handleCheckout = async (plan: 'premium' = 'premium') => {
    setDebugInfo(null);
    try {
      const stripe = await stripePromise;
      if (!stripe) throw new Error('Stripe non caricato');

      const res = await fetch(`${baseURL}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userData?.email ?? null, selected_plan: plan }),
      });

      console.log('[Stripe] status', res.status, res.statusText);
      console.log('[Stripe] content-type', res.headers.get('content-type'));

      let payload: any = null;
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        payload = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Backend ha restituito ${ct}:\n${text}`);
      }
      console.log('[Stripe] payload', payload);

      if (!res.ok) {
        throw new Error(payload?.error || 'Errore backend Stripe');
      }

      const { sessionId } = payload;
      if (!sessionId) {
        throw new Error(`sessionId assente nel payload: ${JSON.stringify(payload, null, 2)}`);
      }

      const { error } = await stripe.redirectToCheckout({ sessionId });
      if (error) throw new Error(error.message);
    } catch (err: any) {
      console.error('[Stripe] catch', err);
      setDebugInfo(String(err));
      alert(err.message || err);
    }
  };

  return (
    <div className={styles.pageContainer}>
      {/* Toggle tema */}
      <button
        onClick={toggleTheme}
        className={styles.themeToggle}
        aria-label={theme === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
      >
        {theme === 'dark' ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
      </button>

      {/* Pulsante login + contatore oppure dati utente */}
      {!userData ? (
        /* ───── Ramo ANONIMO ───── */
        <>
          {/* Google login */}
          <button
            onClick={() => setShowGoogleModal(true)}
            className={styles.glassBtn}
            style={{ position: 'fixed', right: 80, top: 20, zIndex: 1100 }}
            aria-label="Accedi con Google"
          >
            <GoogleGIcon />
            Accedi con&nbsp;Google
          </button>

          {/* Contatore ANON (5 totali) */}
          <div className={styles.freeCounter}>
            {quota?.scope === 'anon'
              ? `${quota.remainingTotal} / ${quota.totalLimit}`
              : `${Math.max(FREE_LIMIT - genCount, 0)} / ${FREE_LIMIT}` /* fallback */}
          </div>
        </>
      ) : (
        /* ───── Ramo UTENTE LOGGATO ───── */
        <>
          {/* Email + piano */}
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
            {/* Contatore solo se è FREE */}
            {quota?.scope === 'user' && quota.plan === 'free' && (
              <span
                className={styles.userCounter}
                title={`Si azzera a mezzanotte (${quota.day})`}
              >
                {quota.remainingToday} / {quota.dailyLimit}
              </span>
            )}
          </div>

          {/* Upgrade se non premium */}
          {userData.plan !== 'premium' && (
            <button
              onClick={() => handleCheckout('premium')}
              className={`${styles.glassBtn} ${styles.upgradeBtn}`}
              style={{ position: 'fixed', right: 80, top: 110, zIndex: 1100 }}
              aria-label="Passa a Premium"
            >
              <LockKeyhole size={18} className={styles.icon} />
              &nbsp;Passa&nbsp;a&nbsp;Premium
            </button>
          )}

          {/* Logout */}
          <button
            onClick={logout}
            className={styles.glassBtn}
            style={{
              position: 'fixed',
              right: 20,
              top: 20,
              zIndex: 1100,
              background: 'rgba(255,80,80,.25)',
            }}
            aria-label="Logout"
          >
            <LogOut size={18} className={styles.icon} />
            &nbsp;Esci
          </button>
        </>
      )}


      {/* Google auth modal popup */}
      {showGoogleModal && (
        <div
          className={styles.modalBackdrop}
          aria-modal="true"
          role="dialog"
          tabIndex={-1}
          onClick={() => setShowGoogleModal(false)}
        >
          <div className={styles.authModal} onClick={e => e.stopPropagation()}>
            <h2 style={{margin:0}}>Accedi con Google</h2>

            {/* bottone Google reso dallo script */}
            <div ref={googleButtonRef} />

            {/* upgrade diretto */}
            <button
              onClick={() => handleCheckout('premium')}
              className={styles.premiumInModal}
              aria-label="Acquista Premium"
            >
              <BadgeDollarSign size={18} aria-hidden />
              Passa direttamente a&nbsp;Premium
            </button>

            <button onClick={() => setShowGoogleModal(false)}>Annulla</button>
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
      </div>

      {/* CHAT SOTTO IL LOGO */}
      <div className={styles.iframeSection}>
        <iframe
          src="https://sgailegal.com/chat/share?shared_id=a92b7464193811f09d527ebdee58e854&from=agent&auth=lmMmVjNjNhZWExNDExZWY4YTVkMDI0Mm&visible_avatar=1"
          title="SGAI Chat Interface"
          style={{
            borderRadius: 'var(--border-radius)',
            width: '100%',
            minHeight: 350,
            maxHeight: 1600,
            border: 'none',
            display: 'block',
            background: 'transparent',
          }}
          allow="clipboard-write"
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
              {quota?.scope === 'anon'
                ? 'Hai esaurito le 5 generazioni gratuite'
                : quota?.scope === 'user' && (quota as QuotaUser).plan !== 'premium'
                ? 'Hai esaurito le 5 generazioni giornaliere'
                : 'Limite raggiunto'}
            </h2>
            <p>
              {quota?.scope === 'anon'
                ? 'Per continuare effettua l’accesso con Google (5 al giorno).'
                : 'Per generazioni illimitate passa a Premium.'}
            </p>

            {!userData ? (
              <button
                onClick={() => setShowGoogleModal(true)}
                className={styles.glassBtn}
                aria-label="Accedi con Google"
              >
                <GoogleGIcon />
                Accedi&nbsp;con&nbsp;Google
              </button>
            ) : (
              (quota as QuotaUser)?.plan !== 'premium' && (
                <button
                  onClick={() => handleCheckout('premium')}
                  className={`${styles.glassBtn} ${styles.upgradeBtn}`}
                  aria-label="Passa a Premium"
                  style={{ marginTop: 12 }}
                >
                  <LockKeyhole size={18} className={styles.icon} />
                  &nbsp;Passa&nbsp;a&nbsp;Premium
                </button>
              )
            )}
          </div>
        </div>
      )}

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
          <h3 className={styles.featureHighlight}>Tutela del Knowhow</h3>
          <p className={styles.featureHighlight}>
            Nessun dato viene acquisito.
            <br />
            Quel che viene discusso con SGAI è accessibile solo all&apos;utente.
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
          <h3 className={styles.featureHighlight}>Personalizzazione</h3>
          <p className={styles.featureHighlight}>
            SGAI può essere potenziato per il singolo Studio professionale:
            <br />
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
          <h3 className={styles.featureHighlight}>Indipendenza e Imparzialità</h3>
          <p className={styles.featureHighlight}>
            SGAI non ha legami istituzionali per garantire la massima trasparenza
          </p>
        </div>
      </div>

      <div className={styles.disclaimerSection}>
        <p><strong>Disclaimer:</strong></p>
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
