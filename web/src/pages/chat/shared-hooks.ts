import { MessageType, SharedFrom } from '@/constants/chat';
import { useCreateNextSharedConversation } from '@/hooks/chat-hooks';
import {
  useSelectDerivedMessages,
  useSendMessageWithSse,
} from '@/hooks/logic-hooks';
import { Message } from '@/interfaces/database/chat';
import { message } from 'antd';
import trim from 'lodash/trim';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'umi';
import { v4 as uuid } from 'uuid';
import { useHandleMessageInputChange } from './hooks';

// No login needed - public access is now allowed on the backend
const isCompletionError = (res: any) =>
  res && (res?.response.status !== 200 || res?.data?.code !== 0);

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


// ✅ AGGIUNGI QUESTA FUNZIONE HELPER PRIMA DI useSendSharedMessage
function getRagflowToken(): string | null {
  return localStorage.getItem('Authorization') || 
         localStorage.getItem('access_token') || 
         null;
}

// ✅ SOSTITUISCI TUTTA LA FUNZIONE useSendSharedMessage CON QUESTA
export const useSendSharedMessage = (overrideConversationId?: string) => {
  const {
    from,
    sharedId: conversationId,
    auth,
    data: data,
  } = useGetSharedChatSearchParams();

  const actualConversationId = overrideConversationId || conversationId;
  const { createSharedConversation: setConversation } =
    useCreateNextSharedConversation();
  const { handleInputChange, value, setValue } = useHandleMessageInputChange();

  // ✅ MODIFICA: Aggiungi Authorization header dinamicamente
  const { send, answer, done, stopOutputMessage } = useSendMessageWithSse(
    `/v1/canvas/completion`,
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(getRagflowToken() && { 'Authorization': getRagflowToken()! }),
      },
      credentials: 'include',
    },
    [],
  );

  const {
    derivedMessages,
    ref,
    removeLatestMessage,
    addNewestAnswer,
    addNewestQuestion,
  } = useSelectDerivedMessages();
  const [hasError, setHasError] = useState(false);

  const sendMessage = useCallback(
    async (message: Message, id?: string) => {
      // ✅ NUOVO: Verifica token RAGFlow
      const ragflowToken = getRagflowToken();
      if (!ragflowToken) {
        console.error('[CHAT] ❌ Token RAGFlow mancante');
        setHasError(true);
        return;
      }

      console.log('[CHAT] ✅ Token presente:', ragflowToken.substring(0, 20) + '...');

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
          console.warn('[QUOTA] Generazione bloccata:', await quotaRes.json());
          return;
        }
        console.log('[QUOTA] ✅ Generazione autorizzata');
      } catch (e) {
        console.error('[QUOTA] Errore:', e);
      }

      // Invia messaggio a RAGFlow
      console.log('[CHAT] 📤 Invio a RAGFlow...');
      const res = await send({
        id: id ?? actualConversationId,
        message: message.content,
        message_id: message.id || uuid(),
        stream: true,
      });

      if (isCompletionError(res)) {
        console.error('[CHAT] ❌ Errore:', res);
        if (res?.data?.code === 102 || res?.response?.status === 401) {
          console.error('[CHAT] ❌ Token non valido/scaduto');
          return;
        }
        setValue(message.content);
        removeLatestMessage();
        setHasError(true);
      } else {
        console.log('[CHAT] ✅ Messaggio inviato');
      }
    },
    [send, actualConversationId, derivedMessages, setValue, removeLatestMessage],
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
  };
};