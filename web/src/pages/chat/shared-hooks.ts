import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { SharedFrom } from '@/constants/chat';
import { useSearchParams } from 'umi';

type ChatRole = 'user' | 'assistant' | 'system';

export interface IMessageLite {
  role: ChatRole;
  content: string;
  id?: string;
}

/* ---------------- URL params ---------------- */
export const useGetSharedChatSearchParams = () => {
  const [searchParams] = useSearchParams();

  const getBool = (k: string, def = true) => {
    const v = searchParams.get(k);
    if (v == null) return def;
    return v === '1' || v === 'true';
  };

  return useMemo(() => {
    return {
      sharedId: searchParams.get('shared_id') || '',
      from: (searchParams.get('from') as SharedFrom) || SharedFrom.Agent,
      locale: searchParams.get('locale') || undefined,
      visibleAvatar: getBool('visibleAvatar', true),
    };
  }, [searchParams]);
};

/* ---------------- Util ---------------- */
const API_HOST = window.location.origin;

function getAgentId(): string {
  const qp = new URL(window.location.href).searchParams.get('shared_id') || '';
  return qp || localStorage.getItem('share_shared_id') || '';
}

function getApiKey(): string {
  // Ordine: localStorage -> sessionStorage -> query param rf_key
  const ls = localStorage.getItem('ragflow_api_key') || '';
  if (ls) return ls;

  const ss = sessionStorage.getItem('ragflow_api_key') || '';
  if (ss) return ss;

  const qp = new URL(window.location.href).searchParams.get('rf_key') || '';
  if (qp) {
    localStorage.setItem('ragflow_api_key', qp);
    return qp;
  }
  throw new Error('API key RAGFlow assente (ragflow_api_key).');
}

function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  };

  const apiKey = getApiKey(); // ← sempre qui
  headers['Authorization'] = apiKey; // niente "Bearer "

  const KEY = 'sgai-client-id';
  let cid = localStorage.getItem(KEY) || localStorage.getItem('Token');
  if (!cid) { cid = crypto.randomUUID(); localStorage.setItem(KEY, cid); }
  headers['X-Client-Id'] = cid;

  return headers;
}

/* ---------------- SSE parser ---------------- */
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

/* ---------------- Hook principale ---------------- */
export function useSendSharedMessage() {
  useGetSharedChatSearchParams(); // keep parsing URL (sharedId già letto altrove)

  const [value, setValue] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [loading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [derivedMessages, setDerivedMessages] = useState<IMessageLite[]>([]);

  const stopRef = useRef<() => void>(() => {});
  const endAnchorRef = useRef<HTMLDivElement | null>(null);

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
      const lastIdx = [...prev].reverse().findIndex(m => m.role === 'assistant');
      const idx = lastIdx >= 0 ? prev.length - 1 - lastIdx : -1;

      if (idx >= 0) {
        const clone = [...prev];
        clone[idx] = { ...clone[idx], content: (clone[idx].content || '') + partial };
        return clone;
      }
      return [...prev, { role: 'assistant', content: partial }];
    });
  };

  const startAssistantMsg = () => {
    setDerivedMessages(prev => [...prev, { role: 'assistant', content: '' }]);
  };

  const stopOutputMessage = useCallback(() => {
    const stopper = stopRef.current;
    if (stopper) {
      try { stopper(); } catch {}
    }
    setIsGenerating(false);
    setSendLoading(false);
  }, []);

    const runSSE = useCallback(async (payload: { message: string }) => {
    setHasError(false);
    setIsGenerating(true);
    setSendLoading(true);

    const controller = new AbortController();
    stopRef.current = () => controller.abort();

    // helper per estrarre testo dai JSON OpenAI-like
    const extractText = (j: any): string => {
      return (
        j?.choices?.[0]?.delta?.content ??
        j?.choices?.[0]?.message?.content ??
        j?.delta?.content ??
        j?.delta ??
        j?.content ??
        j?.text ??
        ''
      );
    };

    // 1) costanti
    const agentId = getAgentId();
    if (!agentId) {
      console.error('[SSE] AGENT_ID (shared_id) mancante');
      setHasError(true);
      setIsGenerating(false);
      setSendLoading(false);
      return;
    }
    const url = `${API_HOST}/v1/canvas/completion`;
    const headers = buildAuthHeaders();

    // 2) tenta STREAM prima, con timeout di “sanity”
    let gotAnyChunk = false;
    let timedOut = false;
    const sanityTimer = setTimeout(() => { timedOut = true; try { controller.abort(); } catch {} }, 1500);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          id: agentId,
          message: payload.message,
          stream: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(sanityTimer);

      if (!res.ok) {
        const body = await res.text().catch(() => '<no-body>');
        console.warn('[SSE] HTTP error', res.status, body.slice(0, 200));
        throw new Error(`HTTP ${res.status}`);
      }

      const ctype = res.headers.get('content-type') || '';
      if (!ctype.includes('text/event-stream') || timedOut) {
        // niente SSE (o timeout) -> fallback sotto
        throw new Error('NO_SSE');
      }

      startAssistantMsg();
      for await (const line of sseLines(res)) {
        if (!line) continue;
        // accetta anche formati con "event: message"
        if (!line.startsWith('data:')) continue;

        const chunk = line.slice(5).trimStart();
        if (chunk === '[DONE]' || chunk === '__SGAI_EOF__') break;

        try {
          const j = JSON.parse(chunk);
          const text = extractText(j);
          if (text) {
            gotAnyChunk = true;
            appendMsg(text);
          }
        } catch {
          // se non è JSON, append raw
          if (chunk) {
            gotAnyChunk = true;
            appendMsg(chunk);
          }
        }
        scrollToBottom();
      }

      if (!gotAnyChunk) {
        // stream avviato ma nessun chunk → fallback una tantum
        throw new Error('EMPTY_STREAM');
      }
    } catch (e: any) {
      clearTimeout(sanityTimer);

      // 3) Fallback automatico: stream:false (risposta JSON intera)
      try {
        const res2 = await fetch(url, {
          method: 'POST',
          headers: { ...headers, Accept: 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            model: 'model',
            messages: [{ role: 'user', content: payload.message }],
            stream: false,
          }),
        });

        const textAll = await res2.text();
        // prova JSON
        try {
          const j = JSON.parse(textAll);
          const txt =
            extractText(j) ||
            j?.choices?.map((c: any) => c?.message?.content || c?.delta?.content || '').join('') ||
            j?.message ||
            textAll;
          if (!derivedMessages.some(m => m.role === 'assistant')) startAssistantMsg();
          appendMsg(String(txt || ''));
        } catch {
          if (!derivedMessages.some(m => m.role === 'assistant')) startAssistantMsg();
          appendMsg(textAll);
        }
        scrollToBottom();
      } catch (e2) {
        console.error('[SSE] fallback error', e2);
        setHasError(true);
      }
    } finally {
      setIsGenerating(false);
      setSendLoading(false);
    }
  }, [derivedMessages.length]);


  const handlePressEnter = useCallback(async () => {
    const content = value.trim();
    if (!content) return;

    const userMsg: IMessageLite = { role: 'user', content, id: uuid() };
    setDerivedMessages(prev => [...prev, userMsg]);
    setValue('');
    scrollToBottom();

    await runSSE({ message: content });
  }, [value, runSSE]);

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
    isGenerating,
  };
}
