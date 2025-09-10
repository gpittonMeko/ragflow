import React, { useRef, useState, useEffect } from 'react';
import styles from './index.less';
import { SvgLogoInteractive } from './SvgLogoInteractive';
import { loadStripe } from '@stripe/stripe-js';
import { LogOut,LockKeyhole,BadgeDollarSign, Sun, Moon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

const CLIENT_ID =
  '872236618020-3len9toeu389v3hkn4nbo198h7d5jk1c.apps.googleusercontent.com';

const FREE_LIMIT = 5; // fallback visuale

// chiave pubblica Stripe (ok metterla nel client)
const STRIPE_PK = 'pk_live_51RkiUSBo6bKd1aEWDjFk1pcLrwyqKH2Z5W7HMYfs41Zl018725OsU5bEImNUR4RgwMIYFuZwdTktddU3ydAL8cYY00TBKXJ0di';
const stripePromise = loadStripe(STRIPE_PK);





// --- base URL backend ---
const baseURL =
  (process.env.UMI_APP_API_BASE as string | undefined) ??
  `${window.location.origin}/oauth`;

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
  const [iframeReady, setIframeReady] = useState(false);  // <-- SPOSTATO QUI DENTRO!

  const iframeRef = useRef<HTMLIFrameElement>(null);


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

  // derivati UI
  // DOPO
  const isLoggedIn = !!userData || quota?.scope === 'user';
  const quotaLoading = quota === null;

  const userPlan =
    (quota?.scope === 'user'
      ? (quota as QuotaUser).plan
      : (userData?.plan as 'free' | 'premium' | undefined)) ?? 'free';

  const isPremium = userPlan === 'premium';


  


// derivati extra per l’overlay
const isUser = quota?.scope === 'user' || !!userData;
const isAnon = quota?.scope === 'anon';
const isUserFree = !quotaLoading && userPlan === 'free';

const isBlocked =
  quota === null
    ? false
    : quota.scope === 'anon'
      ? (quota as QuotaAnon).remainingTotal <= 0
      : quota.scope === 'user'
        ? userPlan !== 'premium' && (quota as QuotaUser).remainingToday <= 0
        : false;   // ⬅️ tolto il fallback genCount





const overlayTitle = !isUser
  ? 'Hai esaurito le 5 generazioni gratuite'
  : isUserFree
    ? 'Hai esaurito le 5 generazioni giornaliere'
    : 'Limite raggiunto';

const overlayBody = !isUser
  ? 'Per continuare effettua l’accesso con Google (5 al giorno).'
  : isUserFree
    ? 'Per continuare, passa a Premium.'
    : '';


function postToIframe(msg: any) {
  try {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(msg, '*');
  } catch {}
}

  // Bootstrap: se ho già il cookie di sessione, prendo l’utente
  // Bootstrap: NON chiamare /oauth/api/me
  useEffect(() => {
    (async () => {
      try {
        // prova direttamente a prendere la quota (anon/user)
        await refreshQuota();
      } catch {}
    })();
  }, []);


//  useEffect(() => {
//  const handleScroll = () => {
//    const upgradeBtn = document.querySelector('.upgradeBtn');
//    if (!upgradeBtn) return;
//
//    if (window.scrollY < 50) {
//      upgradeBtn.classList.add('scrollTopActive');
//    } else {
//      upgradeBtn.classList.remove('scrollTopActive');
//    }
//  };
//
//  window.addEventListener('scroll', handleScroll);
//  handleScroll(); // inizializza all'apertura
//  return () => window.removeEventListener('scroll', handleScroll);
//}, []);

const AuthorizationKey = 'Authorization';






  useEffect(() => { void refreshQuota(); }, []);

  // salva legacy contatore
  useEffect(() => {
  localStorage.setItem('sgai-gen-count', String(genCount));
  if (!isLoggedIn && quota !== null && quota.scope !== 'user' && genCount >= FREE_LIMIT) {
    setShowLimitOverlay(true);
  }
}, [genCount, isLoggedIn, quota]);



  // comunica all’iframe se il limite è stato raggiunto
  useEffect(() => {
  postToIframe({ type: 'limit-status', blocked: quota !== null && showLimitOverlay });
}, [showLimitOverlay, quota]);


  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sgai-theme', theme);
    postToIframe({ type: 'theme-change', theme });
  }, [theme]);

  useEffect(() => {
  const token = localStorage.getItem('access_token');
  if (token) {
    postToIframe({ type: 'ragflow-token', token });
  }
}, [quota, googleToken]);

  useEffect(() => {
      if (showGoogleModal) setShowLimitOverlay(false);
    }, [showGoogleModal]);

    useEffect(() => {
      document.body.style.overflow = (showGoogleModal || showLimitOverlay) ? 'hidden' : '';
      return () => { document.body.style.overflow = ''; };
    }, [showGoogleModal, showLimitOverlay]);


  // espansione iframe
  const [canExpandIframe, setCanExpandIframe] = useState(false);
  const expandTimeoutRef = useRef<any>(null);

  const genTimeoutRef = useRef<number | null>(null);

    // === Allinea i localStorage/cookie con Ragflow guest ===
function ensureGuestLocalStorage() {
  // se non esiste un access_token → crea guest_xxx
  if (!localStorage.getItem("access_token")) {
    const guest = "guest_" + uuidv4();
    localStorage.setItem("access_token", guest);
    document.cookie = `access_token=${guest}; path=/; SameSite=None; Secure`;
  }

  if (!localStorage.getItem("Token")) {
    const token = uuidv4().replace(/-/g, "");
    localStorage.setItem("Token", token);
    document.cookie = `Token=${token}; path=/; SameSite=None; Secure`;
  }

  const guest = localStorage.getItem("access_token");
  if (guest && iframeRef.current?.contentWindow) {
    iframeRef.current.contentWindow.postMessage(
      { type: "ragflow-token", token: guest },
      "*"
    );
    console.log("[PARENT] Guest token inviato all’iframe:", guest);
  }
} // 👈 questa graffa mancava




  async function ensureRagflowAuth() {
  try {
    const existing = localStorage.getItem("Authorization");
    if (existing) return; // già loggato

    const res = await fetch("/v1/user/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: "giovanni.pitton@mekosrl.it", // <-- tua login valida
        password: "L7vKZIooJFo87FJksfv+9BmnzyKOvcgcmwBzEATGv8CXcr+ipmo+c2sWAvbDdMCi2nBIvZukC17nVxMT0+YBqqDiGlxaMJR1NMfyRyN6Jg/idxeagCD4gFUVQ8PWLjK1hzL5IfMNCjZCmPir7AkDGAb7yoohFaIzEcRuzSwLe8f0vhrI243GYqcEL/tYPSmuWj4t8UbQCa4pgqGcFmT2Oo3TBepUlaylgS1anEr1BfU/OqBH2Nd/860T6oaLuDLU9EDdIpthix6DvFuKHkjX88JleQcgv+2tgmr0s7oSqJWRcypWZ5pSH4ybFJ+uLWi8QJ91zCyxldMsGnCChjirag==" 
      }),
    });

    const data = await res.json();
    console.log("[LOGIN RESPONSE]", data);

    const token = res.headers.get("Authorization");
    if (token) {
      localStorage.setItem("Authorization", token);
      console.log("✅ Salvato Authorization:", token);
    } else {
      console.warn("⚠ Nessun Authorization negli header");
    }
  } catch (e) {
    console.error("[ensureRagflowAuth] errore:", e);
  }
}



async function refreshQuota(forceToken?: string) {
  try {
    const headers: Record<string, string> = {};

    if (forceToken ?? googleToken) {
      headers['Authorization'] = forceToken ?? googleToken;
    } else {
      headers['X-Client-Id'] = clientIdRef.current;
    }

    const res = await fetch(`${baseURL}/api/quota`, {
      headers,
      credentials: 'include',
    });

    const data = await res.json();
    console.log('[QUOTA]', data);

    if (res.ok) {
      setQuota(data);
      let blocked = false;
      if (data.scope === 'anon') blocked = data.remainingTotal <= 0;
      else if (data.scope === 'user') blocked = data.plan !== 'premium' && data.remainingToday <= 0;
      setShowLimitOverlay(blocked);
    } else {
      console.warn('quota error', data);
    }
  } catch (e) {
    console.warn('quota network error', e);
  }
}



// usa il guest token per Ragflow, non Authorization
const ragToken = localStorage.getItem('access_token');
if (ragToken) {
  postToIframe({ type: 'ragflow-token', token: ragToken });
  console.log('[PARENT] Token inviato onLoad (guest):', ragToken);
}


useEffect(() => {
  const handler = async (event: MessageEvent) => {
    console.log('[postMessage]', event.data);

    if (event.data?.type === 'shared-needs-token') {
      console.log('[PARENT] Chat richiede token - Login con password crittografata');
      
      try {
        const loginRes = await fetch('/v1/user/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'giovanni.pitton@mekosrl.it',
            password: 'L7vKZIooJFo87FJksfv+9BmnzyKOvcgcmwBzEATGv8CXcr+ipmo+c2sWAvbDdMCi2nBIvZukC17nVxMT0+YBqqDiGlxaMJR1NMfyRyN6Jg/idxeagCD4gFUVQ8PWLjK1hzL5IfMNCjZCmPir7AkDGAb7yoohFaIzEcRuzSwLe8f0vhrI243GYqcEL/tYPSmuWj4t8UbQCa4pgqGcFmT2Oo3TBepUlaylgS1anEr1BfU/OqBH2Nd/860T6oaLuDLU9EDdIpthix6DvFuKHkjX88JleQcgv+2tgmr0s7oSqJWRcypWZ5pSH4ybFJ+uLWi8QJ91zCyxldMsGnCChjirag=='
          })
        });
        
        const loginData = await loginRes.json();
        console.log('[PARENT] Login response:', loginData);
        
        if (loginData.code === 0) {
  const token = localStorage.getItem('access_token'); // usa quello giusto


  if (iframeRef.current?.contentWindow) {
    iframeRef.current.contentWindow.postMessage(
      { type: 'ragflow-token', token },
      '*'
    );
    console.log('[PARENT] Token inviato a iframe');
  }
} else {
  console.error('[PARENT] Login fallito:', loginData);
}

      } catch (err) {
        console.error('[PARENT] Errore login:', err);
      }
    }

    if (event.data?.type === 'iframe-height') {
      const iframe = iframeRef.current;
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

    if (event.data?.type === 'generation-started') {
      console.log('[GENERATION] STARTED');

      if (genTimeoutRef.current) {
        console.warn('[GENERATION] Timer già attivo, non reinizializzo');
        return;
      }

//      genTimeoutRef.current = window.setTimeout(() => {
//        console.warn('[FALLBACK] generation-finished NON ricevuto dopo 120s. Chiamo tickGeneration()');
//        genTimeoutRef.current = null;
//      }, 120000);
//    }
//
//    if (event.data?.type === 'generation-finished') {
//      console.log('[GENERATION] FINISHED');
//
//      if (!userData) {
//        setGenCount(prev => {
//          const next = prev + 1;
//          if (next >= FREE_LIMIT) setShowLimitOverlay(true);
//          return next;
//        });
//      }
//
//      if (genTimeoutRef.current) {
//        clearTimeout(genTimeoutRef.current);
//        genTimeoutRef.current = null;
//        console.log('[GENERATION] Timer di fallback annullato');
//      }
    }
  };

  window.addEventListener('message', handler);
  return () => {
    window.removeEventListener('message', handler);
    if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current);
    if (genTimeoutRef.current) {
      clearTimeout(genTimeoutRef.current);
      genTimeoutRef.current = null;
    }
  };
}, [canExpandIframe, userData, googleToken]);




useEffect(() => {
  (async () => {
    await ensureRagflowAuth();
    setIframeReady(true);  // <-- Abilita iframe dopo login
  })();
}, []);

useEffect(() => {
const token = localStorage.getItem('access_token');
  if (token) {
    postToIframe({ type: 'ragflow-token', token });
  }
}, [quota, googleToken]);



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

  useEffect(() => {
  const onFocus = () => { void refreshQuota(); };
  window.addEventListener('focus', onFocus);
  return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
  console.log('[API_BASE]', baseURL, {
    quotaURL: `${baseURL}/api/quota`,
    genURL: `${baseURL}/api/generate`,
    authURL: `${baseURL}/api/auth/google`,
    stripeURL: `${baseURL}/api/stripe/create-checkout-session`,
  });
}, []);




useEffect(() => {
  setShowLimitOverlay(!!isBlocked);
}, [isBlocked]);


  const handleGoogleResponse = async (response: any) => {
  if (!response.credential) return;
  setGoogleToken(response.credential);

  try {
    const res = await fetch(`${baseURL}/api/auth/google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': clientIdRef.current,
      },
      credentials: 'include',
      body: JSON.stringify({ token: response.credential }),
    });

    const data = await res.json();

    if (res.ok) {
      setUserData({ email: data.email, plan: data.plan });
      setShowGoogleModal(false);
      setGenCount(0);
      localStorage.removeItem('sgai-gen-count');
      await refreshQuota(response.credential);
    } else {
      alert(`Errore di autenticazione: ${data?.error || 'sconosciuto'}`);
      setGoogleToken(null);
    }
  } catch {
    alert('Errore di rete durante autenticazione');
    setGoogleToken(null);
  }
};




  useEffect(() => {
    if (!showGoogleModal || !googleButtonRef.current || googleToken || !gsiReady) return;
    // DOPO
    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: handleGoogleResponse,
      cancel_on_tap_outside: true,
      // evitiamo FedCM auto-prompt: niente banner che genera il warning
      // (se vuoi forzare ancora meno rumore: use_fedcm_for_prompt: true e NON chiamare prompt)
      use_fedcm_for_prompt: true,
    });

    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: theme === 'dark' ? 'filled_black' : 'outline',
      size: 'large',
      type: 'standard',
    });

    // niente prompt() automatico

  }, [showGoogleModal, gsiReady, googleToken, theme]);

  // all'avvio e quando cambia token → allinea quota
  useEffect(() => {
    void refreshQuota();
  }, [googleToken]);

  useEffect(() => {
  const upgraded = localStorage.getItem('sgai-upgraded') === '1';
  if (!upgraded) return;

  localStorage.removeItem('sgai-upgraded');

  // Se l’utente è già loggato → aggiorna quota subito
  if (googleToken) {
    void refreshQuota(googleToken); // usa la versione con forceToken che hai già
  } else {
    // se ha pagato da anonimo, chiedi il login per collegare l’email premium
    const email = localStorage.getItem('sgai-upgraded-email') || '';
    console.log('[upgrade] pagamento ok per', email, '— serve login per associarlo');
    setShowGoogleModal(true);
  }
}, [googleToken]);

  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  const logout = async () => {
    // ① Evita re-login automatico del Google Identity Services
    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.disableAutoSelect();
        const hint =
          (quota?.scope === 'user' ? (quota as QuotaUser).id : userData?.email) || '';
        if (hint) window.google.accounts.id.revoke(hint, () => {});
      } catch {}
    }

    // ② Pulisci lo stato client
    setGoogleToken(null);
    setUserData(null);
    setGenCount(0);
    localStorage.removeItem('sgai-gen-count');
    localStorage.removeItem('sgai-upgraded-email');
    localStorage.removeItem('userInfo');
    localStorage.removeItem('sgai-client-id');
    localStorage.removeItem('sgai-upgraded');

    // ③ Logout server → invalida sessione e cookie HttpOnly
    try {
      await fetch(`${baseURL}/api/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (e) {
      console.warn('Errore logout backend', e);
    }

    // ④ Hard refresh per ripartire anonimo
    window.location.href = '/';
  };





  // Stripe
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  // SOSTITUISCI l’intera handleCheckout con questa
  const handleCheckout = async (plan: 'premium' = 'premium') => {
    if (!isLoggedIn) {
      alert('Accedi con Google prima di acquistare Premium.');
      setShowGoogleModal(true);
      return;
    }

    setDebugInfo(null);
    try {
      const stripe = await stripePromise;
      if (!stripe) throw new Error('Stripe non caricato');

      const res = await fetch(`${baseURL}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',                     // <<— Manda il cookie HttpOnly
        body: JSON.stringify({ selected_plan: plan }) // <<— NIENTE email nel body
      });

      if (res.status === 401) {
        alert('Devi accedere con Google prima di procedere.');
        setShowGoogleModal(true);
        return;
      }

      const ct = res.headers.get('content-type') || '';
      const payload = ct.includes('application/json') ? await res.json() : { error: await res.text() };
      if (!res.ok) throw new Error(payload?.error || 'Errore backend Stripe');

      const { sessionId } = payload;
      if (!sessionId) throw new Error('sessionId assente nel payload');

      const { error } = await stripe.redirectToCheckout({ sessionId });
      if (error) throw new Error(error.message);
    } catch (err: any) {
      console.error('[Stripe] catch', err);
      setDebugInfo(String(err));
      alert(err.message || String(err));
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
      {!isLoggedIn ? (
        <>
          {/* ───── Ramo ANONIMO ───── */}
          <button
            onClick={() => {
              setShowLimitOverlay(false);   // <-- chiudi l’overlay
              setShowGoogleModal(true);     // <-- apri la modale Google
            }}
            className={styles.glassBtn}
            aria-label="Accedi con Google"
          >
            <GoogleGIcon />
            Accedi&nbsp;con&nbsp;Google
          </button>


          <div className={styles.freeCounter}>
            {quota?.scope === 'anon'
              ? `${quota.remainingTotal} / ${quota.totalLimit}`
              : `${Math.max(FREE_LIMIT - genCount, 0)} / ${FREE_LIMIT}`}
          </div>
        </>
      ) : (
        <>
          {/* ───── Ramo UTENTE LOGGATO ───── */}
          <div className={styles.topActions}>
            <div className={styles.userChip}>
              {(quota?.scope === 'user' ? (quota as QuotaUser).id : userData?.email) ?? 'utente'}
              &nbsp;(<strong>{userPlan}</strong>)
              {userPlan === 'free' && quota?.scope === 'user' && (
                <span
                  className={styles.userCounter}
                  title={`Si azzera a mezzanotte (${(quota as QuotaUser).day})`}
                >
                  {(quota as QuotaUser).remainingToday} / {(quota as QuotaUser).dailyLimit}
                </span>
              )}
            </div>

              {/* upgrade diretto (solo se non premium e quota caricata) */}
                {!quotaLoading && !isPremium && (
                  <button
                    onClick={() => handleCheckout('premium')}
                    className={styles.premiumInModal}
                    aria-label="Acquista Premium"
                  >
                    <BadgeDollarSign size={18} aria-hidden />
                    Passa direttamente a&nbsp;Premium
                  </button>
                )}






            <button
            onClick={logout}
            className={`${styles.glassBtn} ${styles.logoutBtn}`}
            aria-label="Logout"
            title="Esci dal tuo account"
          >
            <LogOut className={styles.icon} />
            Esci
          </button>

          </div>

          {/* Banner FREE sotto al logo */}
          {!quotaLoading && userPlan === 'free' && (
            <div className={styles.freeBanner}>
              Benvenuto in <strong>SGAI Free</strong> —&nbsp;
              <strong>
                {quota?.scope === 'user'
                  ? (quota as QuotaUser).remainingToday
                  : Math.max(FREE_LIMIT - genCount, 0)}
                /
                {quota?.scope === 'user'
                  ? (quota as QuotaUser).dailyLimit
                  : FREE_LIMIT}
              </strong>
              &nbsp;oggi • Reset a mezzanotte
              {quota?.scope === 'user' && (quota as QuotaUser).day ? (
                <> ({(quota as QuotaUser).day})</>
              ) : null}
            </div>
          )}
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
        <div className={styles.heroSection}>
          <div className={styles.logoBox}>
            <SvgLogoInteractive flipped />
          </div>
        </div>


      {/* CHAT SOTTO IL LOGO */}
      <div className={styles.iframeSection}>
  <div className={styles.chatWrap}>
    {iframeReady && (
    <iframe
      ref={iframeRef}
      onLoad={async () => {
    console.log('[IFRAME] Caricato');
            // NON inviare nessun token - l'iframe farà il suo login
            postToIframe({ type: 'request-height' });
            postToIframe({ type: 'theme-change', theme });
        }}

      src="https://sgailegal.com/chat/share?shared_id=a92b7464193811f09d527ebdee58e854&from=agent&visible_avatar=0"

        title="SGAI Chat Interface"
      className={quota !== null && showLimitOverlay ? styles.chatFrozen : ''}
      style={{
        borderRadius: 'var(--border-radius)',
        width: '100%',
        height: 'auto',         // 👈 togli minHeight fisso
        border: 'none',
        display: 'block',
        background: 'transparent',
        overflow: 'hidden', 
      }}
      allow="clipboard-write"
    />
      )}
    {showLimitOverlay && (
      <div className={styles.chatOverlay} role="dialog" aria-modal="true">
        <div className={styles.chatOverlayCard}>
          <h2>{overlayTitle}</h2>
          {overlayBody && <p>{overlayBody}</p>}

          {!isUser ? (
            <button
              onClick={() => {
                setShowLimitOverlay(false);
                setShowGoogleModal(true);
              }}
              className={styles.glassBtn}
            >
              <GoogleGIcon />&nbsp;Accedi con Google
            </button>
          ) : (!quotaLoading && isUserFree) ? (
            <button
              onClick={() => handleCheckout('premium')}
              className={`${styles.glassBtn} ${styles.upgradeBtn}`}
            >
              <LockKeyhole size={18} className={styles.icon} />
              &nbsp;Passa a Premium
            </button>
          ) : null}
        </div>
      </div>
    )}
  </div>
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
