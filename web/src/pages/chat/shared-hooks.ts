import { MessageType, SharedFrom } from '@/constants/chat';
import { useCreateNextSharedConversation } from '@/hooks/chat-hooks';
import {
  useSelectDerivedMessages,
  useSendMessageWithSse,
} from '@/hooks/logic-hooks';
import { Message } from '@/interfaces/database/chat';
import { message } from 'antd';
import { get } from 'lodash';
import trim from 'lodash/trim';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'umi';
import { v4 as uuid } from 'uuid';
import { useHandleMessageInputChange } from './hooks';

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

export const useSendSharedMessage = () => {
  const {
    from,
    sharedId: conversationId,
    auth,
    data: data,
  } = useGetSharedChatSearchParams();
  const { createSharedConversation: setConversation } =
    useCreateNextSharedConversation();
  const { handleInputChange, value, setValue } = useHandleMessageInputChange();
  
// helper per normalizzare i token
const normalizeAuth = (raw?: string | null) => {
  if (!raw) return "";
  if (raw.startsWith("guest_")) return raw;       // <-- lascia puro
  if (raw.startsWith("ragflow-")) return `Bearer ${raw}`; 
  if (raw.startsWith("Bearer ")) return raw;
  return raw;   // fallback: non aggiungere Bearer
};


// subito dopo l'useEffect che ascolta i postMessage
useEffect(() => {
  const updateHandler = (e: any) => {
    console.log("[IFRAME] Aggiornato token via evento custom:", e.detail);
    setAuthToken(normalizeAuth(e.detail));
  };
  window.addEventListener("ragflow-token-updated", updateHandler);
  return () => window.removeEventListener("ragflow-token-updated", updateHandler);
}, []);



useEffect(() => {
  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'ragflow-token' && event.data.token) {
      console.log('[IFRAME] Ricevuto token da parent', event.data.token);
      localStorage.setItem("access_token", event.data.token); // salva come guest
setAuthToken(normalizeAuth(event.data.token));          // aggiorna lo state
         // 👈 AGGIORNA LO STATE
    }
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}, []);



const [authToken, setAuthToken] = useState<string>("");

// inizializza quando arriva qualcosa
useEffect(() => {
  const guest = localStorage.getItem("access_token");
const normalized = normalizeAuth(guest);
if (normalized) {
  setAuthToken(normalized);
  console.log("[IFRAME] authToken iniziale:", normalized);
} else {
  console.warn("[IFRAME] Nessun access_token trovato in localStorage");
}

}, [auth]);



const { send, answer, done, stopOutputMessage } = useSendMessageWithSse(
  `/v1/canvas/completion`,
  {
    headers: {
      Authorization: localStorage.getItem('Authorization') || "",  // <-- USA DIRETTAMENTE
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    credentials: "include",
  },
  []  // <-- RIMUOVI DIPENDENZA
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
    // Aspetta che ci sia un token valido
    let token = localStorage.getItem('Authorization');
    let attempts = 0;
    while (!token && attempts < 10) {
      console.log(`[IFRAME] Aspetto token... tentativo ${attempts + 1}`);
      await new Promise(resolve => setTimeout(resolve, 500));
      token = localStorage.getItem('Authorization');
      attempts++;
    }
    
    if (!token) {
      console.error('[IFRAME] Nessun token dopo 5 secondi!');
      return;
    }
    
    console.log("[IFRAME] sendMessage con token:", token.substring(0, 20) + '...');
    const res = await send({
        id: id ?? conversationId,
        message: message.content,          // 👈 non array
        message_id: message.id || uuid(),  // 👈 genera se non c’è
        stream: true,
      });

    if (isCompletionError(res)) {
      if (res?.data?.code === 102 || res?.response?.status === 401) {
        console.warn("[IFRAME] Ignoro errore auth 102/401 (guest).");
        return; // non setto hasError → chat resta attiva
      }
      console.warn("[IFRAME] Errore SSE:", res);
      setValue(message.content);
      removeLatestMessage();
      setHasError(true);
    }



  },
  [send, conversationId, derivedMessages, setValue, removeLatestMessage, authToken]
);


  const handleSendMessage = useCallback(
    async (message: Message) => {
      if (conversationId !== '') {
        sendMessage(message);
      } else {
        const data = await setConversation('user id');
        if (data.code === 0) {
          const id = data.data.id;
          sendMessage(message, id);
        }
      }
    },
    [conversationId, setConversation, sendMessage],
  );

  
  const fetchSessionId = useCallback(async () => {
    const payload = {
      id: conversationId,
      messages: [{ role: 'user', content: '' }],
      stream: true,
    };
    const ret = await send(payload);
    if (isCompletionError(ret)) {
      message.error(ret?.data.message);
      setHasError(true);
    }
  }, [send]);
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
    const content = value.trim();   // 👈 salva qui

    if (done) {
      setValue('');  // reset dopo
      addNewestQuestion({
        content,
        doc_ids: documentIds,
        id,
        role: MessageType.User,
      });
      handleSendMessage({
        content,     // 👈 usa la variabile
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
