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
  const [hideExtras, setHideExtras] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const genTimeoutRef = useRef<number | null>(null);

// --- iframe src + overlay/watchdog ---
const IFRAME_SRC =
  "https://sgailegal.com/chat/share?shared_id=a92b7464193811f09d527ebdee58e854&from=agent&visible_avatar=1";

const [bootOverlay, setBootOverlay] = useState(true);
const iframeReloadAttempts = useRef(0);
const bootCompletedRef = useRef(false);   // ⬅️ segna il boot come completato

const reloadIframe = () => {
  if (!iframeRef.current) return;
  const busted = IFRAME_SRC + (IFRAME_SRC.includes("?") ? "&" : "?") + "ts=" + Date.now();
  iframeRef.current.src = busted;
};

// overlay watchdog (non resta mai appeso)
const bootOverlayRef = useRef(bootOverlay);
useEffect(() => { bootOverlayRef.current = bootOverlay; }, [bootOverlay]);

const bootTimers = useRef<{soft?: number; hard?: number}>({});
const clearBootTimers = () => {
  if (bootTimers.current.soft) { clearTimeout(bootTimers.current.soft); bootTimers.current.soft = undefined; }
  if (bootTimers.current.hard) { clearTimeout(bootTimers.current.hard); bootTimers.current.hard = undefined; }
};

// parte quando l'iframe viene montato
useEffect(() => {
  if (!iframeReady) return;
  if (bootCompletedRef.current) return;   // ⬅️ non riavviare watchdog se già “ok”

  setBootOverlay(true);
  clearBootTimers();

  bootTimers.current.soft = window.setTimeout(() => {
    if (bootOverlayRef.current && iframeReloadAttempts.current < 1) {
      iframeReloadAttempts.current += 1;
      reloadIframe();
    }
  }, 6000);

  bootTimers.current.hard = window.setTimeout(() => {
    if (!bootOverlayRef.current) return;
    const K = "sgai-boot-retried";
    if (localStorage.getItem(K) !== "1") {
      localStorage.setItem(K, "1");
      window.location.reload();
    } else {
      setBootOverlay(false);
      clearBootTimers();
      bootCompletedRef.current = true;            // ⬅️ segnalo completato
      sessionStorage.setItem('sgai-boot-ok','1'); // ⬅️ nota in sessione
    }
  }, 12000);

  return clearBootTimers;
}, [iframeReady]);



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


useEffect(() => {
  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'generation-finished') {
      console.log('[GENERATION] FINISHED');

      if (!isLoggedIn) {
        // fallback locale
        setGenCount(prev => {
          const next = prev + 1;
          localStorage.setItem('sgai-gen-count', String(next));
          if (next >= FREE_LIMIT) setShowLimitOverlay(true);
          return next;
        });
      }

      // 🔑 in ogni caso avvisa il backend di consumare 1 quota
      fetch(`${baseURL}/api/generate`, {
        method: 'POST',
        headers: { 'X-Client-Id': clientIdRef.current },
        credentials: 'include',
      })
        .then(r => r.json())
        .then(d => {
          console.log('[generate → quota]', d);
          void refreshQuota(); // riallinea
        })
        .catch(err => console.warn('[generate err]', err));
    }
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}, [isLoggedIn]);


useEffect(() => {
  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'iframe-height') {
  const iframe = iframeRef.current;
  if (iframe && event.data.height) {
    const newH = Number(event.data.height);
    if (newH > 0) {
      iframe.style.height = `${newH}px`;
    }
    
  }
    setBootOverlay(false); // ⬅️ aggiungi questa riga

}


    if (event.data?.type === 'generation-started') {
      console.log('[GENERATION] STARTED');
    }
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}, []);






async function ensureRagflowAuth(): Promise<string | null> {
  try {
    const existing = localStorage.getItem("Authorization");
    if (existing) {
      console.log("🔑 Authorization già presente:", existing);
      return existing;
    }

    const res = await fetch("/v1/user/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: "giovanni.pitton@mekosrl.it",
        password: "L7vKZIooJFo87FJksfv+9BmnzyKOvcgcmwBzEATGv8CXcr+ipmo+c2sWAvbDdMCi2nBIvZukC17nVxMT0+YBqqDiGlxaMJR1NMfyRyN6Jg/idxeagCD4gFUVQ8PWLjK1hzL5IfMNCjZCmPir7AkDGAb7yoohFaIzEcRuzSwLe8f0vhrI243GYqcEL/tYPSmuWj4t8UbQCa4pgqGcFmT2Oo3TBepUlaylgS1anEr1BfU/OqBH2Nd/860T6oaLuDLU9EDdIpthix6DvFuKHkjX88JleQcgv+2tgmr0s7oSqJWRcypWZ5pSH4ybFJ+uLWi8QJ91zCyxldMsGnCChjirag=="
      }),
    });

    const data = await res.json();
    console.log("[LOGIN RESPONSE]", data);

    // Prendi token dagli header OPPURE dal body
    const token = res.headers.get("Authorization") || data?.token;
    if (token) {
        localStorage.setItem("Authorization", token); // fonte di verità
        localStorage.setItem("access_token", token);  // compat per l’iframe che legge da access_token
        console.log("✅ Salvato Authorization + access_token:", token);
        return token;
      }
  else {
      console.warn("⚠ Nessun Authorization trovato");
      return null;
    }
  } catch (e) {
    console.error("[ensureRagflowAuth] errore:", e);
    return null;
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


// ✅ Unico punto che invia il token al child, quando l’iframe è pronto
useEffect(() => {
  if (!iframeReady) return;
  const token = localStorage.getItem('Authorization'); // <-- unificato
  if (token) {
    postToIframe({ type: 'ragflow-token', token });
  }
}, [iframeReady]);


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


  if (token) {
  console.log("🔑 Authorization disponibile al primo boot:", token);
  setIframeReady(true); // iframe viene montato solo dopo che ho il token
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
  if (iframe && event.data.height) {
    iframe.style.height = `${event.data.height}px`;
  }
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
  };
}, [userData, googleToken]);




useEffect(() => {
  (async () => {
    const token = await ensureRagflowAuth();
    if (token) {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: "ragflow-token", token }, "*");
      }
      setIframeReady(true);
    } else {
      console.warn("⚠ Nessun token al bootstrap");
      const K = "sgai-boot-retried";
      setTimeout(() => {
        if (localStorage.getItem(K) !== "1") {
          localStorage.setItem(K, "1");
          window.location.reload();
        } else {
          setBootOverlay(false); // non bloccare l’utente in overlay
        }
      }, 4000);
    }
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
  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'generation-started') {
      setHideExtras(true);
    }

    if (event.data?.type === 'generation-finished') {
      console.log("Generazione finita, lascio i blocchi nascosti");
      // se vuoi che torni compatto, rimetti:
      // setHideExtras(false);
    }
  }; // 👈 MANCAVA QUESTA CHIUSURA

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}, []);


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
  <div className={`${styles.pageContainer} ${hideExtras ? styles.fullscreen : ''}`}>
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
              setShowLimitOverlay(false);
              setShowGoogleModal(true);
            }}
            className={styles.googleBtnCustom}
            aria-label="Accedi con Google"
          >
            <GoogleGIcon size={18} />
            <span>Accedi con Google</span>
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
        <div className={`${styles.heroSection} ${hideExtras ? styles.heroShrink : ''}`}>
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
      onLoad={() => {


if (false) {
    try {
      const p = iframeRef.current?.contentWindow?.location?.pathname || "";
      if (p === "/login" || p.startsWith("/login")) {
        if (iframeReloadAttempts.current < 1) {
          iframeReloadAttempts.current += 1;
          setBootOverlay(true);
          reloadIframe();
          return;
        }
        window.location.reload();
        return;
      }
    } catch {}
  }
  // iframe ok → handshake e chiudo overlay
  postToIframe({ type: "request-height" });
  postToIframe({ type: "theme-change", theme });
  const t = localStorage.getItem("Authorization");
if (t) postToIframe({ type: "ragflow-token", token: t });
  iframeReloadAttempts.current = 0;   // <-- reset tentativi se tutto ok


  setTimeout(() => { setBootOverlay(false); clearBootTimers(); }, 120);
}}


      src={IFRAME_SRC}

        title="SGAI Chat Interface"
      className={quota !== null && showLimitOverlay ? styles.chatFrozen : ''}
      style={{
        borderRadius: 6,
        width: '100%',
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
      <div className={`${styles.extraBlocks} ${hideExtras ? styles.hidden : ''}`}>
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
            SGAI è un sistema in fase di sviluppo, basato sull’intelligenza artificiale. Lo sappiamo: non è ancora completo,
            e talvolta può fornire risposte inesatte, parziali o incoerenti. Ma è proprio grazie all’uso quotidiano e al supporto
            degli utenti che il progetto può evolversi e migliorare. Il sistema viene aggiornato costantemente, con
            l’integrazione progressiva di nuove fonti, funzionalità e affinamenti della logica. Se oggi non trovi quello che cerchi,
            è possibile che domani ci sia. Pur puntando alla massima accuratezza, invitiamo a verificare sempre i contenuti con
            fonti ufficiali e a consultare professionisti qualificati per ogni decisione rilevante.
          </p>
        </div>
      </div>
      {bootOverlay && (
  <div className={styles.bootOverlay} role="status" aria-live="polite">
    <div className={styles.bootALogo}>
      <svg viewBox="7000 6000 4000 3000" width="56" height="56" aria-hidden>
        <path
          d="M8624 8339 c-8 -8 -14 -25 -14 -36 0 -11 -7 -26 -15 -33 -8 -7 -15
          -19 -15 -27 0 -8 -6 -27 -13 -41 -14 -26 -36 -77 -62 -137 -7 -16 -24 -55 -38
          -85 -13 -30 -44 -100 -67 -154 -23 -54 -45 -106 -49 -115 -5 -9 -15 -33 -24
          -54 -9 -20 -23 -52 -31 -70 -8 -17 -21 -48 -30 -67 -18 -43 -60 -138 -92 -207
          -13 -28 -24 -55 -24 -58 0 -3 -11 -30 -24 -58 -13 -29 -34 -74 -46 -102 -11
          -27 -25 -59 -30 -70 -34 -77 -64 -144 -105 -240 -26 -60 -55 -128 -65 -150
          -22 -49 -42 -95 -70 -160 -26 -61 -30 -70 -74 -168 -20 -42 -36 -79 -36 -82 0
          -2 -14 -34 -31 -72 -40 -90 -44 -100 -69 -158 -12 -27 -25 -59 -30 -70 -5 -11
          -18 -42 -30 -70 -12 -27 -27 -63 -35 -80 -7 -16 -21 -48 -30 -70 -9 -22 -23
          -53 -30 -70 -8 -16 -26 -57 -40 -90 -15 -33 -33 -73 -41 -90 -25 -50 -4 -57
          161 -51 77 3 172 5 210 5 l70 1 112 83 c62 45 155 109 208 142 53 33 126 79
          163 103 37 24 182 113 324 198 298 179 299 179 405 116 66 -39 290 -177 329
          -202 12 -8 67 -42 121 -74 94 -58 217 -137 238 -153 6 -5 28 -20 50 -33 22
          -13 49 -32 59 -42 11 -10 38 -30 60 -45 23 -16 52 -38 66 -51 42 -38 83 -43
          305 -40 l210 3 -2 26 c-1 14 -16 57 -34 95 -34 73 -48 105 -74 169 -9 22 -24
          56 -32 75 -9 19 -22 49 -29 65 -6 17 -20 48 -30 70 -18 42 -31 73 -59 140 -9
          22 -24 56 -32 75 -9 19 -22 49 -29 65 -6 17 -20 48 -30 70 -22 51 -44 102 -60
          140 -17 43 -38 91 -72 165 -16 36 -37 83 -47 105 -23 56 -46 105 -62 137 -7
          14 -13 33 -13 41 0 8 -7 20 -15 27 -8 7 -15 21 -15 30 0 10 -6 31 -14 47 -8
          15 -21 44 -29 63 -19 45 -39 89 -76 173 -17 37 -31 71 -31 76 0 5 -6 22 -14
          38 -42 82 -76 160 -76 174 0 9 -7 22 -15 29 -8 7 -15 23 -15 35 0 12 -7 28
          -15 35 -8 7 -15 18 -15 25 0 8 -7 27 -15 44 -8 17 -22 45 -30 62 -8 17 -15 39
          -15 49 0 9 -7 23 -15 30 -8 7 -15 18 -15 25 0 8 -7 27 -15 44 -8 17 -22 45
          -30 62 -8 17 -15 39 -15 49 0 9 -7 23 -15 30 -8 7 -15 19 -15 27 0 8 -7 28
          -15 44 -8 16 -22 42 -30 58 -8 16 -15 36 -15 44 0 8 -7 20 -15 27 -8 7 -15 23
          -15 36 0 12 -4 26 -10 29 -5 3 -14 24 -20 45 -6 22 -16 40 -23 40 -7 0 -135 1
          -285 3 -239 2 -275 0 -288 -14z m316 -788 c0 -9 4 -21 8 -26 4 -6 18 -37 31
          -70 12 -33 27 -69 31 -80 5 -11 19 -45 31 -75 11 -30 27 -68 34 -85 37 -83 45
          -104 45 -113 0 -6 6 -23 14 -39 8 -15 19 -39 25 -53 5 -14 19 -46 30 -72 12
          -26 21 -51 21 -57 0 -5 6 -22 14 -38 23 -45 46 -100 46 -111 0 -6 6 -23 14
          -39 8 -15 19 -39 25 -53 5 -14 19 -46 30 -72 12 -26 21 -51 21 -57 0 -5 6 -22
          14 -38 8 -15 22 -46 31 -68 9 -22 23 -53 32 -68 13 -26 14 -31 1 -44 -13 -13
          -17 -13 -31 1 -8 9 -19 16 -22 16 -4 0 -44 22 -89 49 -44 27 -106 62 -136 79
          -30 16 -84 46 -120 66 -36 20 -77 41 -92 47 -16 6 -28 15 -28 20 0 12 -43 12
          -56 0 -5 -5 -34 -22 -64 -39 -109 -58 -237 -130 -301 -170 -36 -22 -81 -48
          -99 -57 l-33 -17 7 29 c4 15 14 42 21 58 8 17 23 55 35 85 11 30 25 64 30 75
          5 11 18 43 30 70 12 28 25 59 30 70 5 11 18 43 30 70 11 28 25 58 30 67 6 10
          10 23 10 29 0 10 14 45 45 114 12 27 32 73 67 155 5 14 16 39 23 55 7 17 29
          71 49 120 21 50 42 101 48 115 5 14 16 39 22 55 20 48 49 109 59 123 12 16 37
          -3 37 -27z"
          fill="currentColor"
        />
      </svg>  
    </div>
    </div> )}  {/* chiude .pageContainer */}
          {/* chiude il return */}
          {/* chiude la funzione componente */}

  </div>    
 
)} 
export default PresentationPage;
