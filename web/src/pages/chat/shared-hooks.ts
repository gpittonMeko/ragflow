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
  console.log('[CHAT] 🔍 isCompletionError check:', {
    hasRes: !!res,
    hasResponse: !!res?.response,
    status: res?.response?.status,
    hasData: !!res?.data,
    dataCode: res?.data?.code,
    dataKeys: res?.data ? Object.keys(res.data) : 'NO DATA',
  });

  if (!res?.response) {
    console.log('[CHAT] ⚠️ Nessun response object');
    return true;
  }

  if (res.response.status !== 200) {
    console.log('[CHAT] ⚠️ Status non 200:', res.response.status);
    return true;
  }

  if (res.data && res.data.code !== undefined && res.data.code !== 0) {
    console.log('[CHAT] ⚠️ data.code non è 0:', res.data.code);
    return true;
  }

  console.log('[CHAT] ✅ No errors detected');
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

  console.log('[CHAT] 🔑 getRagflowToken():', {
    Authorization: auth ? auth.substring(0, 20) + '...' : 'NONE',
    access_token: access ? access.substring(0, 20) + '...' : 'NONE',
  });

  return auth || access || null;
}

// ✅ SOSTITUISCI TUTTA LA FUNZIONE useSendSharedMessage
export const useSendSharedMessage = (
  overrideConversationId?: string,
  userSessionId?: string,
) => {
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

  // ✅ AGGIUNGI: Log degli headers che verranno usati
  const ragflowTokenForHeaders = getRagflowToken();
  console.log('[CHAT] 🔧 Headers configurati per useSendMessageWithSse:', {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    Authorization: ragflowTokenForHeaders
      ? ragflowTokenForHeaders.substring(0, 20) + '...'
      : 'NONE',
    credentials: 'include',
  });

  // ✅ MODIFICA: Aggiungi Authorization header dinamicamente
  const { send, answer, done, stopOutputMessage } = useSendMessageWithSse(
    `/v1/canvas/completion`,
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(ragflowTokenForHeaders && {
          Authorization: ragflowTokenForHeaders,
        }),
      },
      credentials: 'include',
    },
  );

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
      console.log('[CHAT] 🚀 === INIZIO sendMessage ===');

      // ✅ DEBUG: Verifica token RAGFlow
      const ragflowToken = getRagflowToken();
      console.log('[CHAT] 🔍 PRE-SEND DEBUG:', {
        tokenPresent: !!ragflowToken,
        tokenPrefix: ragflowToken
          ? ragflowToken.substring(0, 20) + '...'
          : 'NONE',
        conversationId: id ?? actualConversationId,
        messageContent: message.content.substring(0, 50) + '...',
        messageId: message.id || uuid(),
        timestamp: new Date().toISOString(),
      });

      if (!ragflowToken) {
        console.error('[CHAT] ❌ Token RAGFlow mancante - ABORT');
        setHasError(true);
        return;
      }

      console.log(
        '[CHAT] ✅ Token presente:',
        ragflowToken.substring(0, 20) + '...',
      );

      // Decrementa quota OAuth
      try {
        const baseURL = `${window.location.protocol}//${window.location.hostname}/oauth`;
        console.log('[QUOTA] 📤 Chiamata a:', `${baseURL}/api/generate`);

        const quotaRes = await fetch(`${baseURL}/api/generate`, {
          method: 'POST',
          headers: {
            'X-Client-Id': localStorage.getItem('sgai-client-id') || '',
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });

        console.log('[QUOTA] 📡 Response:', {
          status: quotaRes.status,
          ok: quotaRes.ok,
        });

        if (!quotaRes.ok) {
          const quotaData = await quotaRes.json();
          console.warn('[QUOTA] ❌ Generazione bloccata:', quotaData);
          return;
        }
        console.log('[QUOTA] ✅ Generazione autorizzata');
      } catch (e) {
        console.error('[QUOTA] ❌ Errore:', e);
      }

      // Invia messaggio a RAGFlow
      const payload: any = {
        id: id ?? actualConversationId,
        message: message.content,
        message_id: message.id || uuid(),
        stream: true,
      };

      // ✅ Includi session_id solo se è definito (il backend creerà una nuova sessione se mancante)
      if (actualSessionId) {
        payload.session_id = actualSessionId;
      }

      console.log('[CHAT] 📤 === PAYLOAD COMPLETO PER RAGFLOW ===');
      console.log('[CHAT] 📤 Endpoint: /v1/canvas/completion');
      console.log('[CHAT] 📤 Payload:', JSON.stringify(payload, null, 2));
      console.log('[CHAT] 📤 Message content:', message.content);
      console.log(
        '[CHAT] 📤 Session ID:',
        actualSessionId || 'NON PRESENTE (backend creerà nuova sessione)',
      );
      console.log('[CHAT] 📤 Agent ID:', id ?? actualConversationId);

      const res = await send(payload);

      console.log('[CHAT] 📡 RAGFlow raw response:', res);

      // ✅ NUOVO: Ispeziona la response in dettaglio
      if (res?.response) {
        console.log('[CHAT] 🔍 Response object exists');
        console.log('[CHAT] 🔍 Response details:', {
          status: res.response.status,
          statusText: res.response.statusText,
          ok: res.response.ok,
          type: res.response.type,
          url: res.response.url,
        });

        // Prova a estrarre headers
        try {
          const headers: any = {};
          if (res.response.headers) {
            headers['content-type'] = res.response.headers.get('content-type');
            headers['authorization'] =
              res.response.headers.get('authorization');
            headers['x-error'] = res.response.headers.get('x-error');
          }
          console.log('[CHAT] 📋 Response headers:', headers);
        } catch (e) {
          console.warn('[CHAT] ⚠️ Non riesco a leggere gli headers:', e);
        }

        // Body logging removed - was causing "Response body is already used" error
      } else {
        console.warn('[CHAT] ⚠️ res.response è undefined/null');
      }

      // Check errore
      const isError = isCompletionError(res);
      console.log('[CHAT] 🔍 isCompletionError:', isError);

      if (isError) {
        console.error('[CHAT] ❌ isCompletionError = true');
        console.error('[CHAT] ❌ Dettagli errore:', {
          dataCode: res?.data?.code,
          dataMessage: res?.data?.message,
          responseStatus: res?.response?.status,
          responseStatusText: res?.response?.statusText,
        });

        if (res?.data?.code === 102 || res?.response?.status === 401) {
          console.error(
            '[CHAT] ❌ Token non valido/scaduto (code 102 o status 401)',
          );
          return;
        }
        setValue(message.content);
        removeLatestMessage();
        setHasError(true);
      } else {
        console.log('[CHAT] ✅ Messaggio inviato con successo');
      }

      console.log('[CHAT] 🏁 === FINE sendMessage ===');
    },
    [
      send,
      actualConversationId,
      derivedMessages,
      setValue,
      removeLatestMessage,
    ],
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
        });
      }
    },
    [addNewestQuestion, done, handleSendMessage, setValue, value],
  );

  return {
    handlePressEnter,
    handleInputChange,
    value,
    sendLoading: !done,
    ref,
    loading: false,
    derivedMessages,
    hasError,
    stopOutputMessage,
    setDerivedMessages,
  };
};
