import { MessageType, SharedFrom } from '@/constants/chat';
import { useCreateNextSharedConversation } from '@/hooks/chat-hooks';
import {
  useSelectDerivedMessages,
  useSendMessageWithSse,
} from '@/hooks/logic-hooks';
import { Message } from '@/interfaces/database/chat';
import { message } from 'antd';
import trim from 'lodash/trim';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'umi';
import { v4 as uuid } from 'uuid';
import { useHandleMessageInputChange } from './hooks';

// No login needed - public access is now allowed on the backend
const isCompletionError = (res: any) => {
  if (!res?.response) return true;
  if (res.response.status !== 200) return true;
  if (res.data && res.data.code !== undefined && res.data.code !== 0)
    return true;
  return false;
};

export const useSendButtonDisabled = (value: string) => {
  return trim(value) === '';
};

export const useGetSharedChatSearchParams = () => {
  const [searchParams] = useSearchParams();
  const data_prefix = 'data_';
  const data = Object.fromEntries(
    searchParams
      .entries()
      .filter(([key, value]) => key.startsWith(data_prefix))
      .map(([key, value]) => [key.replace(data_prefix, ''), value]),
  );
  return {
    from: searchParams.get('from') as SharedFrom,
    sharedId: searchParams.get('shared_id'),
    locale: searchParams.get('locale'),
    auth: searchParams.get('auth'),
    data: data,
    visibleAvatar: searchParams.get('visible_avatar')
      ? searchParams.get('visible_avatar') !== '1'
      : true,
  };
};

// ✅ HELPER: Ottieni token RAGFlow
function getRagflowToken(): string | null {
  const auth = localStorage.getItem('Authorization');
  const access = localStorage.getItem('access_token');
  return auth || access || null;
}

export type SharedCompletionOptions = {
  /** Deep search (fonti web) lato backend: Tavily se configurato, altrimenti DuckDuckGo */
  getDeepSearch?: () => boolean;
  /** CSV di kb_id da usare nei nodi Retrieval (sottoinsieme di quelli dell’agent) */
  getRetrievalKbIds?: () => string | undefined;
  /** Override top_n sui nodi Retrieval (backend: 1–32) */
  getRetrievalTopN?: () => number | undefined;
};

// ✅ SOSTITUISCI TUTTA LA FUNZIONE useSendSharedMessage
export const useSendSharedMessage = (
  overrideConversationId?: string,
  userSessionId?: string,
  completionOptions?: SharedCompletionOptions,
) => {
  const completionOptsRef = useRef<SharedCompletionOptions | undefined>(
    completionOptions,
  );
  completionOptsRef.current = completionOptions;
  const {
    from,
    sharedId: conversationId,
    auth,
    data: data,
  } = useGetSharedChatSearchParams();

  const actualConversationId = overrideConversationId || conversationId;
  const actualSessionId = userSessionId; // ✅ Session ID per conversazioni separate
  const { createSharedConversation: setConversation } =
    useCreateNextSharedConversation();
  const { handleInputChange, value, setValue } = useHandleMessageInputChange();

  const ragflowTokenForHeaders = getRagflowToken();

  // ✅ MODIFICA: Aggiungi Authorization header dinamicamente
  const { send, answer, done, stopOutputMessage, isGenerating } =
    useSendMessageWithSse(`/v1/canvas/completion`, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(ragflowTokenForHeaders && {
          Authorization: ragflowTokenForHeaders,
        }),
      },
      credentials: 'include',
    });

  const {
    derivedMessages,
    removeLatestMessage,
    addNewestAnswer,
    addNewestQuestion,
    setDerivedMessages,
  } = useSelectDerivedMessages();
  const ref = useRef<HTMLDivElement>(null); // ✅ ref locale per scroll
  const [hasError, setHasError] = useState(false);

  const sendMessage = useCallback(
    async (message: Message, id?: string) => {
      const ragflowToken = getRagflowToken();

      if (!ragflowToken) {
        setHasError(true);
        return;
      }

      // Decrementa quota OAuth
      try {
        const baseURL = `${window.location.protocol}//${window.location.hostname}/oauth`;

        const quotaRes = await fetch(`${baseURL}/api/generate`, {
          method: 'POST',
          headers: {
            'X-Client-Id': localStorage.getItem('sgai-client-id') || '',
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });

        if (!quotaRes.ok) {
          const quotaData = await quotaRes.json();
          console.warn('[QUOTA] Generazione bloccata:', quotaData);
          return;
        }
      } catch (e) {
        console.error('[QUOTA] Errore:', e);
      }

      // Invia messaggio a RAGFlow
      const payload: any = {
        id: id ?? actualConversationId,
        message: message.content,
        message_id: message.id || uuid(),
        stream: true,
      };

      if (actualSessionId) {
        payload.session_id = actualSessionId;
      }

      if (message.doc_ids && message.doc_ids.length > 0) {
        payload.doc_ids = message.doc_ids.join(',');
      }

      const ds = completionOptsRef.current?.getDeepSearch?.();
      if (ds === true) {
        payload.deep_search = true;
      }

      const kbCsv = completionOptsRef.current?.getRetrievalKbIds?.();
      if (kbCsv) {
        payload.retrieval_kb_ids = kbCsv;
      }

      const topN = completionOptsRef.current?.getRetrievalTopN?.();
      if (typeof topN === 'number' && topN > 0) {
        payload.retrieval_top_n = topN;
      }

      const res = await send(payload);

      const isError = isCompletionError(res);

      if (isError) {
        if (res?.data?.code === 102 || res?.response?.status === 401) {
          return;
        }
        setValue(message.content);
        removeLatestMessage();
        setHasError(true);
      }
    },
    [send, actualConversationId, setValue, removeLatestMessage],
  );

  const handleSendMessage = useCallback(
    async (message: Message) => {
      if (actualConversationId !== '') {
        sendMessage(message);
      } else {
        const data = await setConversation('user id');
        if (data.code === 0) {
          const id = data.data.id;
          sendMessage(message, id);
        }
      }
    },
    [actualConversationId, setConversation, sendMessage],
  );

  const fetchSessionId = useCallback(async () => {
    const payload = {
      id: actualConversationId,
      messages: [{ role: 'user', content: '' }],
      stream: true,
    };
    const ret = await send(payload);
    if (isCompletionError(ret)) {
      message.error(ret?.data.message);
      setHasError(true);
    }
  }, [actualConversationId, send]);

  useEffect(() => {
    if (answer.answer) {
      addNewestAnswer(answer);
    }
  }, [answer, addNewestAnswer]);

  const handlePressEnter = useCallback(
    (documentIds: string[]) => {
      if (trim(value) === '') return;
      const id = uuid();
      const content = value.trim();

      if (done) {
        setValue('');
        addNewestQuestion({
          content,
          doc_ids: documentIds,
          id,
          role: MessageType.User,
        });
        handleSendMessage({
          content,
          id,
          role: MessageType.User,
          doc_ids: documentIds.length ? documentIds : undefined,
        });
      }
    },
    [addNewestQuestion, done, handleSendMessage, setValue, value],
  );

  return {
    handlePressEnter,
    handleInputChange,
    value,
    setValue,
    sendLoading: !done,
    ref,
    loading: false,
    derivedMessages,
    hasError,
    stopOutputMessage,
    setDerivedMessages,
    isGenerating,
    answer,
  };
};
