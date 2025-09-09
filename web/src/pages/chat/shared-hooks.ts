// src/pages/chat/share/shared-hooks.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { MessageType, SharedFrom } from '@/constants/chat';
import { useSearchParams } from 'umi';

type ChatRole = 'user' | 'assistant' | 'system';

export interface IMessageLite {
  role: ChatRole;
  content: string;
  id?: string;
}

// ========= PARSING PARAMETRI URL (come stai già usando) =========
export const useGetSharedChatSearchParams = () => {
  const [searchParams] = useSearchParams();

  const data = useMemo(() => {
    const getBool = (k: string, def = true) => {
      const v = searchParams.get(k);
      if (v == null) return def;
      return v === '1' || v === 'true';
    };

    return {
      sharedId: searchParams.get('shared_id') || '',
      from: (searchParams.get('from') as SharedFrom) || SharedFrom.Agent,
      locale: searchParams.get('locale') || undefined,
      visibleAvatar: getBool('visibleAvatar', true),
    };
  }, [searchParams]);

  return data;
};

// ========= COSTANTI API =========
const API_BASE = `${window.location.origin}/oauth`;
const GEN_URL = `${API_BASE}/api/generate`;

// ========= COSTRUTTORE HEADER COERENTE (guest vs user) =========
function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  };

  // token dal parent (vedi postMessage) – coerente con PresentationPage
  const tok =
    localStorage.getItem('access_token') ||
    sessionStorage.getItem('access_token') ||
    localStorage.getItem('Authorization') ||
    sessionStorage.getItem('Authorization') ||
    '';

  if (!tok || tok.startsWith('guest_')) {
    // Anonimo → usa X-Client-Id stabile
    const KEY = 'sgai-client-id';
    let cid = localStorage.getItem(KEY);
    if (!cid) {
      // riusa eventualmente il tuo Token random, altrimenti crea
      cid = localStorage.getItem('Token') || crypto.randomUUID();
      localStorage.setItem(KEY, cid);
    }
    headers['X-Client-Id'] = cid;
  } else {
    // Utente (Google ID token) → Authorization
    headers['Authorization'] = tok.startsWith('Bearer ') ? tok : `Bearer ${tok}`;
  }

  return headers;
}

// ========= PARSER SEMPLICE SSE (gestisce anche JSON “non SSE”) =========
async function* sseLines(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trimEnd();
      buf = buf.slice(idx + 1);
      yield line;
    }
  }
  if (buf) yield buf;
}

// ========= HOOK PRINCIPALE USATO DAL TUO COMPONENTE =========
export function useSendSharedMessage() {
  const [value, setValue] = useState('');
  const [sendLoading, setSendLoading] = useState(false);   // “sto inviando” (UI)
  const [loading, setLoading] = useState(false);           // caricamenti vari
  const [hasError, setHasError] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false); // ★ usato per la barra
  const [derivedMessages, setDerivedMessages] = useState<IMessageLite[]>([]);
  const stopRef = useRef<() => void>(() => {});
  const endAnchorRef = useRef<HTMLDivElement | null>(null);

  // per compat con il tuo componente
  const ref = useCallback((node: HTMLDivElement | null) => {
    endAnchorRef.current = node;
  }, []);

  const scrollToBottom = () => {
    if (!endAnchorRef.current) return;
    endAnchorRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
  }, []);

  const appendMsg = (partial: string) => {
    setDerivedMessages(prev => {
      // trova l’ultimo assistant in generazione
      const lastIdx = [...prev].reverse().findIndex(m => m.role === 'assistant');
      const idx = lastIdx >= 0 ? prev.length - 1 - lastIdx : -1;

      if (idx >= 0) {
        const clone = [...prev];
        clone[idx] = { ...clone[idx], content: (clone[idx].content || '') + partial };
        return clone;
      }
      // altrimenti crea un nuovo assistant
      return [...prev, { role: 'assistant', content: partial }];
    });
  };

  const startAssistantMsg = () => {
    setDerivedMessages(prev => [...prev, { role: 'assistant', content: '' }]);
  };

  const stopOutputMessage = useCallback(() => {
    // interrompi eventuale stream attivo
    const stopper = stopRef.current;
    if (stopper) {
      try { stopper(); } catch {}
    }
    setIsGenerating(false);
    setSendLoading(false);
  }, []);

  const runSSE = useCallback(async (payload: any) => {
    setHasError(false);
    setIsGenerating(true);
    setSendLoading(true);

    const controller = new AbortController();
    stopRef.current = () => controller.abort();

    try {
      const res = await fetch(GEN_URL, {
        method: 'POST',
        headers: buildAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ ...payload, stream: true }),
        signal: controller.signal,
      });

      // Backend può rispondere 403/401 per limiti o auth
      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '<no-body>');
        console.warn('[SSE] HTTP error', res.status, body.slice(0, 200));
        setHasError(true);
        return;
      }

      const ctype = res.headers.get('content-type') || '';
      if (!ctype.includes('text/event-stream')) {
        // fallback JSON (es. backend demo)
        const data = await res.json().catch(() => ({}));
        if (typeof data?.message === 'string') {
          appendMsg(data.message);
        } else {
          appendMsg('[no stream available]');
        }
        return;
      }

      // SSE streaming
      startAssistantMsg();
      for await (const line of sseLines(res)) {
        if (!line) continue;
        // formato minimo: "data: <chunk>"
        if (line.startsWith('data:')) {
          const chunk = line.slice(5).trimStart();
          if (chunk === '[DONE]' || chunk === '__SGAI_EOF__') break;

          // alcuni backend inviano JSON per riga
          try {
            const j = JSON.parse(chunk);
            const text = j?.delta ?? j?.content ?? j?.text ?? '';
            if (text) appendMsg(text);
          } catch {
            appendMsg(chunk);
          }
          scrollToBottom();
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error('[SSE] exception', e);
        setHasError(true);
      }
    } finally {
      setIsGenerating(false);
      setSendLoading(false);
    }
  }, []);

  const handlePressEnter = useCallback(async () => {
    const content = value.trim();
    if (!content) return;

    // push messaggio utente
    const userMsg: IMessageLite = { role: 'user', content, id: uuid() };
    setDerivedMessages(prev => [...prev, userMsg]);
    setValue('');
    scrollToBottom();

    // avvia generazione
    await runSSE({
      conversation_id: 'shared',
      messages: [{ role: 'user', content }],
    });
  }, [value, runSSE]);

  // piccolo effetto per autoscroll quando arrivano messaggi
  useEffect(() => {
    const t = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(t);
  }, [derivedMessages.length]);

  return {
    handlePressEnter,
    handleInputChange,
    value,
    sendLoading,
    loading,
    ref,
    derivedMessages,
    hasError,
    stopOutputMessage,
    isGenerating, // ★ usato dal tuo loader
  };
}
