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

export const useSendSharedMessage = (overrideConversationId?: string) => {
  const {
    from,
    sharedId: conversationId,
    auth,
    data: data,
  } = useGetSharedChatSearchParams();

  // Use overrideConversationId if provided, otherwise fall back to URL param
  const actualConversationId = overrideConversationId || conversationId;
  const { createSharedConversation: setConversation } =
    useCreateNextSharedConversation();
  const { handleInputChange, value, setValue } = useHandleMessageInputChange();

  const { send, answer, done, stopOutputMessage } = useSendMessageWithSse(
    `/v1/canvas/completion`,
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
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
      // ✅ PRIMA chiama il backend OAuth per decrementare la quota
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
          console.warn('[QUOTA] Generation blocked:', await quotaRes.json());
          // Non procedere se la quota è esaurita
          return;
        }
      } catch (e) {
        console.error('[QUOTA] Error calling /api/generate:', e);
        // Procedi comunque per non bloccare la chat in caso di errore di rete
      }

      const res = await send({
        id: id ?? actualConversationId,
        message: message.content,
        message_id: message.id || uuid(),
        stream: true,
      });

      if (isCompletionError(res)) {
        if (res?.data?.code === 102 || res?.response?.status === 401) {
          return; // non setto hasError → chat resta attiva
        }
        setValue(message.content);
        removeLatestMessage();
        setHasError(true);
      }
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
  //
  //  useEffect(() => {
  //    fetchSessionId();
  //  }, [fetchSessionId, send]);

  useEffect(() => {
    if (answer.answer) {
      addNewestAnswer(answer);
    }
  }, [answer, addNewestAnswer]);

  const handlePressEnter = useCallback(
    (documentIds: string[]) => {
      if (trim(value) === '') return;
      const id = uuid();
      const content = value.trim(); // 👈 salva qui

      if (done) {
        setValue(''); // reset dopo
        addNewestQuestion({
          content,
          doc_ids: documentIds,
          id,
          role: MessageType.User,
        });
        handleSendMessage({
          content, // 👈 usa la variabile
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
