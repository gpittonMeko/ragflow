// src/pages/chat/share/shared-hooks.ts
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

/* ---------------- Header auth ---------------- */
function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  };

  // Leggi SIA access_token che Authorization (retro-compat dal tuo ChatContainer)
  const tok =
    localStorage.getItem('Authorization') ||
    sessionStorage.getItem('Authorization') ||
    localStorage.getItem('access_token') ||
    sessionStorage.getItem('access_token') ||
    '';

  if (tok) {
    // RAGFlow share accetta il token grezzo; NON prefixare 'Bearer '
    headers['Authorization'] = tok;
  }

  // Mantieni anche X-Client-Id per il tracciamento lato quota/analytics
  const KEY = 'sgai-client-id';
  let cid = localStorage.getItem(KEY);
  if (!cid) {
    cid = localStorage.getItem('Token') || crypto.randomUUID();
    localStorage.setItem(KEY, cid);
  }
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
  const { sharedId, from } = useGetSharedChatSearchParams();

  const [value, setValue] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [loading, setLoading] = useState(false);
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

  const runSSE = useCallback(async (payload: any) => {
    setHasError(false);
    setIsGenerating(true);
    setSendLoading(true);

    const controller = new AbortController();
    stopRef.current = () => controller.abort();

    try {
      // endpoint corretto per agent/canvas
      const url = `${window.location.origin}/v1/canvas/completion`;

      const res = await fetch(url, {
        method: 'POST',
        headers: buildAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ ...payload, stream: true }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '<no-body>');
        console.warn('[SSE] HTTP error', res.status, body.slice(0, 200));
        setHasError(true);
        return;
      }

      const ctype = res.headers.get('content-type') || '';
      if (!ctype.includes('text/event-stream')) {
        const data = await res.json().catch(() => ({}));
        if (typeof data?.message === 'string') {
          appendMsg(data.message);
        } else {
          appendMsg('[no stream available]');
        }
        return;
      }

      startAssistantMsg();
      for await (const line of sseLines(res)) {
        if (!line) continue;
        if (line.startsWith('data:')) {
          const chunk = line.slice(5).trimStart();
          if (chunk === '[DONE]' || chunk === '__SGAI_EOF__') break;
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

    const userMsg: IMessageLite = { role: 'user', content, id: uuid() };
    setDerivedMessages(prev => [...prev, userMsg]);
    setValue('');
    scrollToBottom();

    await runSSE({
      id: sharedId || 'shared',
      message: content,
      message_id: uuid(),
    });
  }, [value, runSSE, sharedId]);

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
