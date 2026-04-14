import WhatsAppSupport from '@/components/whatsapp-support';
import { loadStripe } from '@stripe/stripe-js';
import { Button, Collapse } from 'antd';
import {
  BadgeDollarSign,
  ChevronDown,
  CreditCard,
  Home,
  LockKeyhole,
  LogOut,
  MapPin,
  Maximize2,
  Menu,
  Moon,
  Sun,
  X,
} from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { Helmet, useNavigate } from 'umi';
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
    // Rimuovi la chat esistente e aggiungila in cima con il nuovo timestamp
    history.splice(existingIndex, 1);
    history.unshift(session);
  } else {
    history.unshift(session);
  }

  // Ordina per timestamp decrescente (più recenti prima)
  history.sort((a, b) => b.timestamp - a.timestamp);

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

// Google Cloud → OAuth client: aggiungi tutte le origini usate in prod (www, apex, app.) in "Authorized JavaScript origins".
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
  const [expandedShellFrame, setExpandedShellFrame] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [hasMessages, setHasMessages] = useState(false);
  const [chatHasBeenOpened, setChatHasBeenOpened] = useState(false);

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

  const handleExpandChat = useCallback(() => {
    if (chatExpanded) return;
    if (!hasMessages) {
      const newSessionId = uuidv4().slice(0, 32);
      sessionStorage.setItem(CURRENT_SESSION_KEY, newSessionId);
      setSessionId(newSessionId);
      setCurrentChatTitle('Nuova Chat');
      setChatHasBeenOpened(true);
    } else {
      setChatHasBeenOpened(true);
    }
    setChatExpanded(true);
  }, [chatExpanded, hasMessages]);

  useEffect(() => {
    const previousHtmlOverflowX = document.documentElement.style.overflowX;
    const previousHtmlOverflowY = document.documentElement.style.overflowY;
    const previousBodyOverflowX = document.body.style.overflowX;
    const previousBodyOverflowY = document.body.style.overflowY;

    document.documentElement.style.overflowX = 'hidden';
    document.documentElement.style.overflowY = 'hidden';
    document.body.style.overflowX = 'hidden';
    document.body.style.overflowY = 'hidden';

    return () => {
      document.documentElement.style.overflowX = previousHtmlOverflowX;
      document.documentElement.style.overflowY = previousHtmlOverflowY;
      document.body.style.overflowX = previousBodyOverflowX;
      document.body.style.overflowY = previousBodyOverflowY;
    };
  }, []);

  // --- CHAT HISTORY FUNCTIONS ---
  const loadChatHistory = () => {
    const history = getChatHistory();
    // Ordina per timestamp decrescente (più recenti prima)
    const sortedHistory = [...history].sort(
      (a, b) => b.timestamp - a.timestamp,
    );
    setChatHistory(sortedHistory);
  };

  const createNewChat = () => {
    const newSessionId = uuidv4().slice(0, 32);
    sessionStorage.setItem(CURRENT_SESSION_KEY, newSessionId);
    // Ricarica la pagina per pulire completamente la chat
    window.location.reload();
  };

  const switchToChat = (chat: ChatSession) => {
    setCurrentSessionId(chat.sessionId);
    setSessionId(chat.sessionId);
    sessionStorage.setItem(CURRENT_SESSION_KEY, chat.sessionId);
    setCurrentChatTitle(chat.title);
    setHasMessages(true);
    setChatExpanded(true);
    setShowLeftSidebar(false); // Chiudi sidebar

    // Aggiorna il timestamp quando si apre una chat esistente
    const updatedChat: ChatSession = {
      ...chat,
      timestamp: Date.now(),
    };
    addChatSession(updatedChat);
    loadChatHistory();
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

  // iOS/Android: allinea la shell fullscreen a visualViewport così la tastiera non copre la chat
  useLayoutEffect(() => {
    if (!chatExpanded) {
      setExpandedShellFrame(null);
      return;
    }
    if (typeof window === 'undefined' || !window.visualViewport) {
      setExpandedShellFrame(null);
      return;
    }
    const vv = window.visualViewport;
    const sync = () => {
      setExpandedShellFrame({
        top: vv.offsetTop,
        left: vv.offsetLeft,
        width: vv.width,
        height: vv.height,
      });
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
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
            <a
              href="https://home.sgailegal.com"
              className={styles.homeLinkBtn}
              aria-label="SGAI Home"
            >
              <Home size={16} />
              <span>SGAI</span>
            </a>

            <button
              onClick={() => {
                setShowLimitOverlay(false);
                setShowGoogleModal(true);
              }}
              className={styles.googleBtnCustom}
              aria-label="Accedi con Google"
            >
              <GoogleGIcon size={18} />
              <span>Accedi</span>
            </button>

            <div className={styles.freeCounter}>
              {!quota
                ? '5 / 5'
                : quota.scope === 'anon'
                  ? `${Math.max(0, (quota as QuotaAnon).remainingTotal)} / ${(quota as QuotaAnon).totalLimit}`
                  : (quota as QuotaUser).dailyLimit === -1
                    ? '∞'
                    : `${Math.max(0, (quota as QuotaUser).remainingToday)} / ${(quota as QuotaUser).dailyLimit}`}
            </div>

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
                <Sun size={18} aria-hidden />
              ) : (
                <Moon size={18} aria-hidden />
              )}
            </button>

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
                  {userPlan === 'free' &&
                    quota?.scope === 'user' &&
                    (quota as QuotaUser).dailyLimit !== -1 && (
                      <span
                        className={styles.userCounter}
                        title={`Si azzera a mezzanotte (${(quota as QuotaUser).day})`}
                      >
                        {Math.max(0, (quota as QuotaUser).remainingToday)} /{' '}
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
                  ? (quota as QuotaUser).dailyLimit === -1
                    ? '∞'
                    : `${Math.max(0, (quota as QuotaUser).remainingToday)} / ${(quota as QuotaUser).dailyLimit}`
                  : `${Math.max(FREE_LIMIT - genCount, 0)} / ${FREE_LIMIT}`}
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
        className={`${styles.heroSection} ${chatExpanded ? styles.heroHiddenDuringChat : ''} ${hideExtras ? styles.heroShrink : ''}`}
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
      {/* Un solo DirectChat: wrapper con display:contents quando compressa per non smontare il componente */}
      <div
        className={chatExpanded ? styles.chatExpandedShell : undefined}
        style={
          chatExpanded
            ? expandedShellFrame
              ? {
                  top: expandedShellFrame.top,
                  left: expandedShellFrame.left,
                  width: expandedShellFrame.width,
                  height: expandedShellFrame.height,
                  right: 'auto',
                  bottom: 'auto',
                }
              : undefined
            : { display: 'contents' }
        }
      >
        {chatExpanded && (
          <div className={styles.chatFullHeader}>
            <button
              type="button"
              onClick={() => setChatExpanded(false)}
              className={styles.chatFullHeaderLogo}
              aria-label="Chiudi chat e torna alla home"
            >
              <SvgLogoInteractive flipped={false} />
            </button>
            <div className={styles.chatFullHeaderActions}>
              <a
                href="https://home.sgailegal.com"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.chatFullHeaderBtn}
                aria-label="Vai alla home SGAI"
              >
                <Home size={18} />
                <span className={styles.chatFullHeaderBtnLabel}>Home</span>
              </a>
              <button
                onClick={toggleTheme}
                className={styles.chatFullHeaderBtn}
                aria-label={theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'}
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className={styles.chatFullHeaderBtn}
                aria-label="Menu"
              >
                <Menu size={18} />
              </button>
              <button
                onClick={() => setChatExpanded(false)}
                className={styles.closeChatBtn}
                aria-label="Chiudi chat"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>
            {menuOpen && (
              <div className={styles.chatFullHeaderDropdown}>
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
          </div>
        )}
        <div
          className={chatExpanded ? styles.chatExpandedMain : undefined}
          style={chatExpanded ? undefined : { display: 'contents' }}
        >
          <div
            className={`${styles.iframeSection} ${!chatExpanded ? styles.iframeSectionDocked : ''}`}
            style={{
              position: 'relative',
              padding: 0,
              margin: 0,
              overflow: 'hidden',
              boxSizing: 'border-box',
              ...(chatExpanded
                ? {
                    flex: 1,
                    minHeight: 0,
                    height: '100%',
                    width: '100%',
                    zIndex: 1,
                    background: 'var(--bg-primary)',
                  }
                : {
                    zIndex: 10,
                    background: 'transparent',
                    width: 'auto',
                    height: hasMessages ? '272px' : '156px',
                    transition: 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                  }),
            }}
          >
            {!chatExpanded && (
              <button
                type="button"
                className={styles.chatExpandBar}
                onClick={handleExpandChat}
                aria-label="Apri chat a tutto schermo"
              >
                <Maximize2 size={15} strokeWidth={2.5} aria-hidden />
                <span>Apri chat a tutto schermo</span>
                <ChevronDown
                  size={16}
                  className={styles.chatExpandBarChevron}
                  aria-hidden
                />
              </button>
            )}
            <div
              className={styles.chatWrap}
              style={{
                height: '100%',
                width: '100%',
                padding: 0,
                margin: 0,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
              }}
            >
              <div
                className={!chatExpanded ? styles.chatEmbedInner : undefined}
                style={{
                  borderRadius: chatExpanded ? 0 : 12,
                  width: '100%',
                  height: '100%',
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'transparent',
                  overflow: 'hidden',
                  padding: 0,
                  margin: 0,
                }}
              >
                <DirectChat
                  agentId="a92b7464193811f09d527ebdee58e854"
                  sessionId={sessionId}
                  omitKeyboardInset={!chatExpanded}
                  layoutExpanded={chatExpanded}
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
                <div
                  className={styles.chatOverlay}
                  role="dialog"
                  aria-modal="true"
                >
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
        </div>
      </div>
      {/* FEATURE */}
      <div
        className={`${styles.extraBlocks} ${hideExtras ? styles.hidden : ''}`}
        style={{ display: chatExpanded ? 'none' : 'block' }}
      >
        <div className={styles.featuresSection}>
          <Collapse
            accordion
            bordered={false}
            expandIconPosition="end"
            className={styles.featuresAccordion}
            expandIcon={({ isActive }) => (
              <ChevronDown
                size={18}
                className={
                  isActive
                    ? `${styles.featureAccordionIcon} ${styles.featureAccordionIconOpen}`
                    : styles.featureAccordionIcon
                }
                aria-hidden
              />
            )}
            items={[
              {
                key: 'privacy',
                label: (
                  <span className={styles.featureAccordionLabel}>
                    <span
                      className={styles.featureAccordionIconWrap}
                      aria-hidden
                    >
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
                    </span>
                    Riservatezza totale
                  </span>
                ),
                children: (
                  <p className={styles.featureAccordionBody}>
                    Le tue conversazioni restano private. Nessun dato viene
                    acquisito o condiviso con terzi.
                  </p>
                ),
              },
              {
                key: 'studio',
                label: (
                  <span className={styles.featureAccordionLabel}>
                    <span
                      className={styles.featureAccordionIconWrap}
                      aria-hidden
                    >
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
                    </span>
                    Su misura per te
                  </span>
                ),
                children: (
                  <p className={styles.featureAccordionBody}>
                    Potenzia SGAI con i documenti del tuo Studio. Risposte
                    calibrate sulla tua operatività quotidiana.
                  </p>
                ),
              },
              {
                key: 'independent',
                label: (
                  <span className={styles.featureAccordionLabel}>
                    <span
                      className={styles.featureAccordionIconWrap}
                      aria-hidden
                    >
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
                    </span>
                    Indipendente e imparziale
                  </span>
                ),
                children: (
                  <p className={styles.featureAccordionBody}>
                    Nessun legame istituzionale. Analisi oggettiva al servizio
                    del professionista.
                  </p>
                ),
              },
            ]}
          />
        </div>

        <div className={styles.disclaimerSection}>
          <p>
            <strong>Disclaimer:</strong>
          </p>
          <p>
            SGAI è un sistema in fase di sviluppo, basato sull'intelligenza
            artificiale. Lo sappiamo: non è ancora completo, e talvolta può
            fornire risposte inesatte, parziali o incoerenti. Ma è proprio
            grazie all'uso quotidiano e al supporto degli utenti che il progetto
            può evolversi e migliorare. Il sistema viene aggiornato
            costantemente, con l'integrazione progressiva di nuove fonti,
            funzionalità e affinamenti della logica. Se oggi non trovi quello
            che cerchi, è possibile che domani ci sia. Pur puntando alla massima
            accuratezza, invitiamo a verificare sempre i contenuti con fonti
            ufficiali e a consultare professionisti qualificati per ogni
            decisione rilevante.
          </p>
        </div>

        {/* Sede Legale - Separato e ben visibile sotto il disclaimer */}
        <div className={styles.legalFooter}>
          <p>
            SGAI S.r.l. - Sede Legale: Via Ettore Majorana 32, Noventa di Piave
            (VE)
          </p>
        </div>
      </div>

      {/* WhatsApp Support Button - FIXED bottom left */}
      <WhatsAppSupport phoneNumber="3288216708" />

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
                        {(() => {
                          const date = new Date(chat.timestamp);
                          const today = new Date();
                          const isToday =
                            date.toDateString() === today.toDateString();
                          const isYesterday =
                            date.toDateString() ===
                            new Date(today.getTime() - 86400000).toDateString();

                          if (isToday) {
                            return `Oggi alle ${date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
                          } else if (isYesterday) {
                            return `Ieri alle ${date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
                          } else {
                            return date.toLocaleString('it-IT', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            });
                          }
                        })()}
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

      <Helmet>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap"
          rel="stylesheet"
        />
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-P9QCNBXQKP"
        />
        <script>
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-P9QCNBXQKP');
          `}
        </script>
      </Helmet>
    </div>
  );
};

export default PresentationPage;
