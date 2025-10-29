import WhatsAppSupport from '@/components/whatsapp-support';
import { loadStripe } from '@stripe/stripe-js';
import { Button } from 'antd';
import {
  BadgeDollarSign,
  CreditCard,
  Home,
  LockKeyhole,
  LogOut,
  MapPin,
  Menu,
  Moon,
  Sun,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'umi';
import { v4 as uuidv4 } from 'uuid';
import { SvgLogoInteractive } from './SvgLogoInteractive';
import DirectChat from './direct-chat';
import styles from './index.less';

// --- CHAT HISTORY MANAGEMENT ---
interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: number;
  sessionId: string;
}

const CHAT_HISTORY_KEY = 'sgai-chat-history';
const CURRENT_SESSION_KEY = 'sgai-current-session';

// ✅ Codice beta tester hardcoded
const BETA_TESTER_CODE = 'SGAI2024BETA';

// --- CHAT HISTORY FUNCTIONS ---
const getChatHistory = (): ChatSession[] => {
  try {
    const stored = localStorage.getItem(CHAT_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveChatHistory = (history: ChatSession[]) => {
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Error saving chat history:', e);
  }
};

const addChatSession = (session: ChatSession) => {
  const history = getChatHistory();
  const existingIndex = history.findIndex((h) => h.id === session.id);

  if (existingIndex >= 0) {
    history[existingIndex] = session;
  } else {
    history.unshift(session);
  }

  // Keep only last 20 chats
  const limitedHistory = history.slice(0, 20);
  saveChatHistory(limitedHistory);
};

const getCurrentSessionId = (): string => {
  try {
    return sessionStorage.getItem(CURRENT_SESSION_KEY) || '';
  } catch {
    return '';
  }
};

const setCurrentSessionId = (sessionId: string) => {
  try {
    sessionStorage.setItem(CURRENT_SESSION_KEY, sessionId);
  } catch (e) {
    console.error('Error setting current session:', e);
  }
};

const CLIENT_ID =
  '872236618020-3len9toeu389v3hkn4nbo198h7d5jk1c.apps.googleusercontent.com';

const FREE_LIMIT = 5; // fallback visuale

// chiave pubblica Stripe (ok metterla nel client)
const STRIPE_PK =
  'pk_live_51RkiUSBo6bKd1aEWDjFk1pcLrwyqKH2Z5W7HMYfs41Zl018725OsU5bEImNUR4RgwMIYFuZwdTktddU3ydAL8cYY00TBKXJ0di';
const stripePromise = loadStripe(STRIPE_PK);

// --- base URL backend ---
// Always use HTTPS if page is loaded over HTTPS (prevent Mixed Content)
const getBaseURL = () => {
  const envBase = process.env.UMI_APP_API_BASE as string | undefined;
  if (envBase) {
    // Force the env URL to use the same protocol as the current page
    const url = new URL(envBase);
    url.protocol = window.location.protocol;
    return url.origin + url.pathname.replace(/\/$/, '');
  }
  // Use nginx proxy path instead of direct port access
  return `${window.location.protocol}//${window.location.hostname}/oauth`;
};
const baseURL = getBaseURL();

/* --- mini-component per la “G” trasparente --- */
const GoogleGIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg
    viewBox="0 0 256 262"
    width={size}
    height={size}
    aria-hidden="true"
    style={{ verticalAlign: 'middle' }}
  >
    <path
      fill="#4285F4"
      d="M255.9 133.5c0-11.5-1-23.1-3.2-34.2H130v64.8h70.8c-3.1 17-12.7 31.4-27 41.2l43.6 34.2c25.5-23.5 40.5-58.3 40.5-106z"
    />
    <path
      fill="#34A853"
      d="M130 262c36.7 0 67.6-12.1 90.2-32.8l-43.6-34.2c-12.1 8.3-27.6 13.2-46.6 13.2-35.8 0-66.2-24.1-77-56.8l-45 34.7c22.7 44.4 69.3 75.9 122 75.9z"
    />
    <path
      fill="#FBBC05"
      d="M53 151.4c-2.9-8.4-4.6-17.4-4.6-26.4s1.7-18 4.6-26.4l-45-34.7C3 85.5 0 101.2 0 125s3 39.5 8 61.1l45-34.7z"
    />
    <path
      fill="#EA4335"
      d="M130 49.8c20 0 38 6.9 52.1 20.4l39-39C199.3 11 166.6 0 130 0 77.3 0 30.7 31.5 8 75.9l45 34.7C63.8 73.9 94.2 49.8 130 49.8z"
    />
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
  id: string; // email
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

// ✅ Genera session_id unico per ogni TAB (conversazioni separate)
function getOrCreateSessionId(): string {
  let id = sessionStorage.getItem('sgai-session-id');
  if (!id) {
    id = uuidv4();
    sessionStorage.setItem('sgai-session-id', id);
    console.log('[SESSION] Creato nuovo session_id:', id);
  } else {
    console.log('[SESSION] Riutilizzo session_id:', id);
  }
  return id;
}

const PresentationPage: React.FC = () => {
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [hideExtras, setHideExtras] = useState(false);
  const [showHomeButton, setShowHomeButton] = useState(false);

  const genTimeoutRef = useRef<number | null>(null);
  const navigate = useNavigate();

  const [userChipOpen, setUserChipOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleHomeClick = () => {
    navigate('/knowledge');
  };

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
  const [chatExpanded, setChatExpanded] = useState(false);
  const [hasMessages, setHasMessages] = useState(false);

  // ✅ Beta tester states
  const [showBetaCodeModal, setShowBetaCodeModal] = useState(false);
  const [betaCode, setBetaCode] = useState('');

  // quota server-side
  const [quota, setQuota] = useState<QuotaAnon | QuotaUser | null>(null);
  const clientIdRef = useRef<string>(getOrCreateClientId());

  // ✅ Session ID unico per ogni browser (conversazioni separate nel DB!)
  const [sessionId, setSessionId] = useState<string>(getOrCreateSessionId());

  // Load current session from sessionStorage
  useEffect(() => {
    const currentSession = getCurrentSessionId();
    if (currentSession) {
      // Update sessionId if we have a stored one
      setSessionId(currentSession);
      sessionStorage.setItem('sgai-session-id', currentSession);
    }
    loadChatHistory();
  }, []);

  // --- CHAT HISTORY STATE ---
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [showLeftSidebar, setShowLeftSidebar] = useState(false);
  const [currentChatTitle, setCurrentChatTitle] = useState('Nuova Chat');

  // --- CHAT HISTORY FUNCTIONS ---
  const loadChatHistory = () => {
    setChatHistory(getChatHistory());
  };

  const createNewChat = () => {
    const newSessionId = uuidv4().slice(0, 32);
    setCurrentSessionId(newSessionId);
    setSessionId(newSessionId);
    setCurrentChatTitle('Nuova Chat');
    setHasMessages(false);
    setChatExpanded(true); // Apri la chat
    setShowChatHistory(false); // Chiudi sidebar
    // NON ricaricare la pagina - mantieni l'UI
  };

  const switchToChat = (chat: ChatSession) => {
    setCurrentSessionId(chat.sessionId);
    setSessionId(chat.sessionId);
    setCurrentChatTitle(chat.title);
    setHasMessages(true);
    setChatExpanded(true);
    setShowChatHistory(false); // Chiudi sidebar
    // NON ricaricare la pagina - mantieni l'UI
  };

  const updateCurrentChat = (title: string, lastMessage: string) => {
    const chatSession: ChatSession = {
      id: sessionId,
      title: title || 'Nuova Chat',
      lastMessage,
      timestamp: Date.now(),
      sessionId: sessionId,
    };
    addChatSession(chatSession);
    setCurrentChatTitle(chatSession.title);
    loadChatHistory();
  };

  // ✅ Beta tester functions
  const handleBetaCodeSubmit = () => {
    if (betaCode === BETA_TESTER_CODE) {
      // Aggiorna quota a premium
      const premiumQuota: QuotaUser = {
        scope: 'user',
        id: 'beta-tester',
        plan: 'premium',
        usedToday: 0,
        dailyLimit: -1, // illimitato
        remainingToday: -1,
        day: new Date().toISOString().split('T')[0],
      };
      setQuota(premiumQuota);

      // Salva in localStorage
      localStorage.setItem('sgai-beta-code', BETA_TESTER_CODE);
      localStorage.setItem('sgai-quota', JSON.stringify(premiumQuota));

      toast.success('Codice beta accettato! Accesso premium attivato.');
      setShowBetaCodeModal(false);
      setBetaCode('');
    } else {
      toast.error('Codice beta non valido.');
    }
  };

  // Check for existing beta code on mount
  useEffect(() => {
    const savedBetaCode = localStorage.getItem('sgai-beta-code');
    if (savedBetaCode === BETA_TESTER_CODE) {
      const premiumQuota: QuotaUser = {
        scope: 'user',
        id: 'beta-tester',
        plan: 'premium',
        usedToday: 0,
        dailyLimit: -1,
        remainingToday: -1,
        day: new Date().toISOString().split('T')[0],
      };
      setQuota(premiumQuota);
    }
  }, []);

  // Update sessionStorage when sessionId changes
  useEffect(() => {
    sessionStorage.setItem('sgai-session-id', sessionId);
    console.log('[SESSION] Updated sessionId:', sessionId);
  }, [sessionId]);

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
          : false; // ⬅️ tolto il fallback genCount

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

  // Bootstrap: prende quota all'avvio
  useEffect(() => {
    (async () => {
      try {
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

  useEffect(() => {
    void refreshQuota();
  }, []);

  // salva legacy contatore
  useEffect(() => {
    localStorage.setItem('sgai-gen-count', String(genCount));
    if (
      !isLoggedIn &&
      quota !== null &&
      quota.scope === 'anon' &&
      genCount >= FREE_LIMIT
    ) {
      setShowLimitOverlay(true);
    }
  }, [genCount, isLoggedIn, quota]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sgai-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (showGoogleModal) setShowLimitOverlay(false);
  }, [showGoogleModal]);

  useEffect(() => {
    document.body.style.overflow =
      showGoogleModal || showLimitOverlay ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [showGoogleModal, showLimitOverlay]);

  // Sync al login
  // ✅ CERCA QUESTO useEffect E SOSTITUISCILO
  useEffect(() => {
    if (!isLoggedIn) return;

    const syncOnLogin = async () => {
      // 1. Sync Stripe (può fallire, non bloccante)
      try {
        const res = await fetch(`${baseURL}/api/stripe/sync`, {
          method: 'POST',
          credentials: 'include',
        });

        const data = await res.json();

        if (data.changed && data.new_plan === 'premium') {
          toast.success('Account Premium attivato!');
          await refreshQuota();
        }
      } catch (err) {
        console.warn('⚠️ Stripe sync error (non bloccante):', err);
      }

      // 2. ✅ NUOVO: Assicura token RAGFlow valido
      const token = await ensureRagflowAuth();
      if (token) {
        console.log('✅ Token RAGFlow pronto:', token.substring(0, 20) + '...');
      }
    };

    syncOnLogin();
  }, [isLoggedIn]);

  async function ensureRagflowAuth(): Promise<string | null> {
    try {
      const existing = localStorage.getItem('Authorization');

      if (existing) {
        console.log('🔑 Authorization già presente:', existing);
        return existing;
      }

      const res = await fetch('/v1/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: 'giovanni.pitton@mekosrl.it',
          password:
            'L7vKZIooJFo87FJksfv+9BmnzyKOvcgcmwBzEATGv8CXcr+ipmo+c2sWAvbDdMCi2nBIvZukC17nVxMT0+YBqqDiGlxaMJR1NMfyRyN6Jg/idxeagCD4gFUVQ8PWLjK1hzL5IfMNCjZCmPir7AkDGAb7yoohFaIzEcRuzSwLe8f0vhrI243GYqcEL/tYPSmuWj4t8UbQCa4pgqGcFmT2Oo3TBepUlaylgS1anEr1BfU/OqBH2Nd/860T6oaLuDLU9EDdIpthix6DvFuKHkjX88JleQcgv+2tgmr0s7oSqJWRcypWZ5pSH4ybFJ+uLWi8QJ91zCyxldMsGnCChjirag==',
        }),
      });

      const data = await res.json();
      console.log('[LOGIN RESPONSE]', data);

      // Prendi token dagli header OPPURE dal body
      const token = res.headers.get('Authorization') || data?.token;
      if (token) {
        localStorage.setItem('Authorization', token); // fonte di verità
        localStorage.setItem('access_token', token); // compat per l’iframe che legge da access_token
        console.log('✅ Salvato Authorization + access_token:', token);
        console.log(
          '✅ [PARENT] Token salvato alle',
          new Date().toISOString(),
          token.substring(0, 20),
        ); // ← AGGIUNGI SOLO QUESTA RIGA

        return token;
      } else {
        console.warn('⚠ Nessun Authorization trovato');
        return null;
      }
    } catch (e) {
      console.error('[ensureRagflowAuth] errore:', e);
      return null;
    }
  }

  async function refreshQuota(forceToken?: string) {
    try {
      const headers: Record<string, string> = {};

      // SOLO Google OAuth token o X-Client-Id (niente localStorage)
      const authToken = forceToken ?? googleToken;

      if (authToken) {
        // Google OAuth token sempre con Bearer
        headers['Authorization'] = `Bearer ${authToken}`;
        console.log(
          '[QUOTA] Using Google Bearer token:',
          authToken.substring(0, 20) + '...',
        );
      } else {
        headers['X-Client-Id'] = clientIdRef.current;
        console.log('[QUOTA] Using X-Client-Id:', clientIdRef.current);
      }

      console.log('[QUOTA] Fetching from:', `${baseURL}/api/quota`);
      const res = await fetch(`${baseURL}/api/quota`, {
        headers,
        credentials: 'include',
      });

      const data = await res.json();
      console.log('[QUOTA] Response:', data);

      if (res.ok) {
        setQuota(data);
        let blocked = false;
        if (data.scope === 'anon') blocked = data.remainingTotal <= 0;
        else if (data.scope === 'user')
          blocked = data.plan !== 'premium' && data.remainingToday <= 0;
        setShowLimitOverlay(blocked);
      } else {
        console.warn('quota error', data);
      }
    } catch (e) {
      console.warn('quota network error', e);
    }
  }

  // Bootstrap auth for ragflow
  useEffect(() => {
    (async () => {
      await ensureRagflowAuth();
    })();
  }, []);

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
    const onFocus = () => {
      void refreshQuota();
    };
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
    if (!userChipOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.userChip}`)) {
        setUserChipOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [userChipOpen]);

  useEffect(() => {
    if (
      !showGoogleModal ||
      !googleButtonRef.current ||
      googleToken ||
      !gsiReady
    )
      return;
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
      console.log(
        '[upgrade] pagamento ok per',
        email,
        '— serve login per associarlo',
      );
      setShowGoogleModal(true);
    }
  }, [googleToken]);

  const toggleTheme = () =>
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const logout = async () => {
    // ① Evita re-login automatico del Google Identity Services
    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.disableAutoSelect();
        const hint =
          (quota?.scope === 'user'
            ? (quota as QuotaUser).id
            : userData?.email) || '';
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
        credentials: 'include', // <<— Manda il cookie HttpOnly
        body: JSON.stringify({ selected_plan: plan }), // <<— NIENTE email nel body
      });

      if (res.status === 401) {
        alert('Devi accedere con Google prima di procedere.');
        setShowGoogleModal(true);
        return;
      }

      const ct = res.headers.get('content-type') || '';
      const payload = ct.includes('application/json')
        ? await res.json()
        : { error: await res.text() };
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

  // Change body background when chat is expanded
  React.useEffect(() => {
    if (chatExpanded) {
      document.body.style.backgroundColor = 'transparent';
      document.documentElement.style.backgroundColor = 'transparent';
    } else {
      document.body.style.backgroundColor = '';
      document.documentElement.style.backgroundColor = '';
    }
  }, [chatExpanded]);

  return (
    <div
      className={`${styles.pageContainer} ${hideExtras ? styles.fullscreen : ''} ${chatExpanded ? styles.chatExpandedMode : ''}`}
    >
      {/* Pulsante login + contatore oppure dati utente */}
      {!isLoggedIn ? (
        <>
          {/* ───── Ramo ANONIMO ───── */}
          <div className={styles.anonHeader}>
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
              {!quota
                ? '5 / 5'
                : quota.scope === 'anon'
                  ? `${(quota as QuotaAnon).remainingTotal} / ${(quota as QuotaAnon).totalLimit}`
                  : `${(quota as QuotaUser).remainingToday} / ${(quota as QuotaUser).dailyLimit}`}
            </div>

            {/* Hamburger Menu per Anonimi */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className={styles.hamburgerButton}
              aria-label="Menu"
            >
              {menuOpen ? (
                <X size={24} aria-hidden />
              ) : (
                <Menu size={24} aria-hidden />
              )}
            </button>
          </div>

          {/* Dropdown Menu per Anonimi */}
          {menuOpen && (
            <div className={styles.dropdownMenu}>
              <button
                onClick={() => {
                  navigate('/roadmap');
                  setMenuOpen(false);
                }}
                className={styles.menuItem}
              >
                <MapPin size={20} />
                <span>Roadmap & Sviluppi Futuri</span>
              </button>
              <button
                onClick={() => {
                  setShowLeftSidebar(!showLeftSidebar);
                  setMenuOpen(false);
                }}
                className={styles.menuItem}
              >
                <Menu size={20} />
                <span>Gestione Chat</span>
              </button>
              <button
                onClick={() => {
                  setShowBetaCodeModal(true);
                  setMenuOpen(false);
                }}
                className={styles.menuItem}
              >
                <LockKeyhole size={20} />
                <span>Codice Beta Tester</span>
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          {/* ───── Ramo UTENTE LOGGATO ───── */}
          <div className={styles.topActions}>
            <div
              className={`${styles.userChip} ${userChipOpen ? styles.userChipExpanded : ''}`}
              onClick={() => setUserChipOpen(!userChipOpen)}
            >
              {userChipOpen ? (
                <>
                  <span>
                    {(quota?.scope === 'user'
                      ? (quota as QuotaUser).id
                      : userData?.email) ?? 'utente'}
                  </span>
                  &nbsp;(<strong>{userPlan}</strong>)
                  {userPlan === 'free' && quota?.scope === 'user' && (
                    <span
                      className={styles.userCounter}
                      title={`Si azzera a mezzanotte (${(quota as QuotaUser).day})`}
                    >
                      {(quota as QuotaUser).remainingToday} /{' '}
                      {(quota as QuotaUser).dailyLimit}
                    </span>
                  )}
                </>
              ) : (
                <span className={styles.userIcon}>👤</span>
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

            {/* Toggle tema */}
            <button
              onClick={toggleTheme}
              className={styles.themeToggle}
              aria-label={
                theme === 'dark'
                  ? 'Passa al tema chiaro'
                  : 'Passa al tema scuro'
              }
            >
              {theme === 'dark' ? (
                <Sun size={20} aria-hidden />
              ) : (
                <Moon size={20} aria-hidden />
              )}
            </button>

            {/* Hamburger Menu */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className={styles.hamburgerButton}
              aria-label="Menu"
            >
              {menuOpen ? (
                <X size={24} aria-hidden />
              ) : (
                <Menu size={24} aria-hidden />
              )}
            </button>
          </div>

          {/* Dropdown Menu */}
          {menuOpen && (
            <div className={styles.dropdownMenu}>
              <button
                onClick={() => {
                  navigate('/subscription');
                  setMenuOpen(false);
                }}
                className={styles.menuItem}
              >
                <CreditCard size={20} />
                <span>Gestione Abbonamento</span>
              </button>
              <button
                onClick={() => {
                  navigate('/roadmap');
                  setMenuOpen(false);
                }}
                className={styles.menuItem}
              >
                <MapPin size={20} />
                <span>Roadmap & Sviluppi Futuri</span>
              </button>
              <button
                onClick={() => {
                  setShowLeftSidebar(!showLeftSidebar);
                  setMenuOpen(false);
                }}
                className={styles.menuItem}
              >
                <Menu size={20} />
                <span>Gestione Chat</span>
              </button>
              <button
                onClick={() => {
                  setShowBetaCodeModal(true);
                  setMenuOpen(false);
                }}
                className={styles.menuItem}
              >
                <LockKeyhole size={20} />
                <span>Codice Beta Tester</span>
              </button>
            </div>
          )}

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
          <div
            className={styles.authModal}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: 0 }}>Accedi con Google</h2>

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
        className={`${styles.heroSection} ${hideExtras ? styles.heroShrink : ''}`}
        style={{ display: chatExpanded ? 'none' : 'block' }}
      >
        <div className={styles.logoBox}>
          <SvgLogoInteractive flipped />
          {showHomeButton && (
            <Button
              type="primary"
              icon={<Home />}
              onClick={handleHomeClick}
              className={styles.homeButton}
            >
              Home
            </Button>
          )}
        </div>
      </div>
      {/* CHAT SOTTO IL LOGO */}
      <div
        className={styles.iframeSection}
        style={{
          position: chatExpanded ? 'fixed' : 'relative',
          top: chatExpanded ? 0 : 'auto',
          left: chatExpanded ? 0 : 'auto',
          right: chatExpanded ? 0 : 'auto',
          bottom: chatExpanded ? 0 : 'auto',
          zIndex: chatExpanded ? 9999 : 'auto',
          background: 'transparent',
          width: chatExpanded ? '100vw' : 'auto',
          height: chatExpanded ? '100vh' : hasMessages ? '300px' : '150px',
          padding: 0,
          margin: 0,
          transition: 'height 0.3s ease',
        }}
      >
        {chatExpanded && (
          <button
            onClick={() => setChatExpanded(false)}
            style={{
              position: 'fixed',
              top: 10,
              right: 10,
              zIndex: 10001,
              background: 'rgba(0,0,0,0.7)',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              width: 40,
              height: 40,
              cursor: 'pointer',
              fontSize: 24,
            }}
          >
            ×
          </button>
        )}
        <div
          className={styles.chatWrap}
          style={{
            height: '100%',
            width: '100%',
            padding: 0,
            margin: 0,
          }}
        >
          <div
            style={{
              borderRadius: chatExpanded ? 0 : 6,
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              background: 'transparent',
              overflow: chatExpanded ? 'hidden' : 'auto',
              padding: 0,
              margin: 0,
            }}
            onClick={() => {
              if (!chatExpanded) {
                setChatExpanded(true);
              }
            }}
          >
            <DirectChat
              key={sessionId} // Force re-render when sessionId changes
              agentId="a92b7464193811f09d527ebdee58e854"
              sessionId={sessionId}
              onMessagesChange={(count) => setHasMessages(count > 0)}
              onChatUpdate={updateCurrentChat}
              onGenerationComplete={() => {
                console.log(
                  '[INDEX] Generation completed, refreshing quota...',
                );
                void refreshQuota();
              }}
            />
          </div>
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
                    <GoogleGIcon />
                    &nbsp;Accedi con Google
                  </button>
                ) : !quotaLoading && isUserFree ? (
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
      <div
        className={`${styles.extraBlocks} ${hideExtras ? styles.hidden : ''}`}
        style={{ display: chatExpanded ? 'none' : 'block' }}
      >
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
              Quel che viene discusso con SGAI è accessibile solo
              all&apos;utente.
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
            <h3 className={styles.featureHighlight}>
              Indipendenza e Imparzialità
            </h3>
            <p className={styles.featureHighlight}>
              SGAI non ha legami istituzionali per garantire la massima
              trasparenza
            </p>
          </div>
        </div>

        <div className={styles.disclaimerSection}>
          <p>
            <strong>Disclaimer:</strong>
          </p>
          <p>
            SGAI è un sistema in fase di sviluppo, basato sull’intelligenza
            artificiale. Lo sappiamo: non è ancora completo, e talvolta può
            fornire risposte inesatte, parziali o incoerenti. Ma è proprio
            grazie all’uso quotidiano e al supporto degli utenti che il progetto
            può evolversi e migliorare. Il sistema viene aggiornato
            costantemente, con l’integrazione progressiva di nuove fonti,
            funzionalità e affinamenti della logica. Se oggi non trovi quello
            che cerchi, è possibile che domani ci sia. Pur puntando alla massima
            accuratezza, invitiamo a verificare sempre i contenuti con fonti
            ufficiali e a consultare professionisti qualificati per ogni
            decisione rilevante.
          </p>
        </div>
      </div>

      {/* WhatsApp Support Button */}
      <WhatsAppSupport phoneNumber="3288216708" />

      {/* Footer con Sede Legale */}
      <div className={styles.legalFooter}>
        <p>
          SGAI S.r.l. - Sede Legale: Via Ettore Majorana 32, Noventa di Piave
          (VE)
        </p>
      </div>

      {/* Left Sidebar - Chat Management */}
      {showLeftSidebar && (
        <div
          className={`${styles.leftSidebar} ${showLeftSidebar ? styles.show : ''}`}
        >
          <div className={styles.leftSidebarHeader}>
            <h3>Gestione Chat</h3>
            <button
              onClick={() => setShowLeftSidebar(false)}
              className={styles.closeButton}
            >
              <X size={20} />
            </button>
          </div>
          <div className={styles.leftSidebarContent}>
            <button onClick={createNewChat} className={styles.newChatButton}>
              <X size={16} />
              Nuova Chat
            </button>
            <div className={styles.chatHistorySection}>
              <h4>Storico Chat</h4>
              <div className={styles.chatHistoryList}>
                {chatHistory.length === 0 ? (
                  <div className={styles.noChats}>Nessuna chat precedente</div>
                ) : (
                  chatHistory.map((chat) => (
                    <div
                      key={chat.id}
                      className={`${styles.chatItem} ${
                        chat.sessionId === sessionId ? styles.activeChat : ''
                      }`}
                      onClick={() => switchToChat(chat)}
                    >
                      <div className={styles.chatTitle}>{chat.title}</div>
                      <div className={styles.chatPreview}>
                        {chat.lastMessage}
                      </div>
                      <div className={styles.chatTime}>
                        {new Date(chat.timestamp).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Beta Tester */}
      {showBetaCodeModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3>Codice Beta Tester</h3>
            <p>Inserisci il codice per accedere all'account premium:</p>
            <input
              type="text"
              value={betaCode}
              onChange={(e) => setBetaCode(e.target.value)}
              placeholder="Inserisci codice beta"
              className={styles.betaCodeInput}
            />
            <div className={styles.modalActions}>
              <button
                onClick={() => setShowBetaCodeModal(false)}
                className={styles.cancelButton}
              >
                Annulla
              </button>
              <button
                onClick={handleBetaCodeSubmit}
                className={styles.submitButton}
              >
                Attiva Premium
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PresentationPage;
