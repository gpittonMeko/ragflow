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


// Login automatico per l'iframe
async function ensureIframeAuth() {
  const existing = localStorage.getItem("Authorization");
  if (existing) {
    // Test se funziona ancora
    try {
      const testRes = await fetch("/v1/canvas/completion", {
        method: "POST",
        headers: {
          "Authorization": existing,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: "a92b7464193811f09d527ebdee58e854",
          message: "test",
          stream: false
        })
      });
      if (testRes.status === 200) return; // Token OK
    } catch {}
  }
  
  // Fai login
  try {
    const res = await fetch("/v1/user/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "giovanni.pitton@mekosrl.it",
        password: "L7vKZIooJFo87FJksfv+9BmnzyKOvcgcmwBzEATGv8CXcr+ipmo+c2sWAvbDdMCi2nBIvZukC17nVxMT0+YBqqDiGlxaMJR1NMfyRyN6Jg/idxeagCD4gFUVQ8PWLjK1hzL5IfMNCjZCmPir7AkDGAb7yoohFaIzEcRuzSwLe8f0vhrI243GYqcEL/tYPSmuWj4t8UbQCa4pgqGcFmT2Oo3TBepUlaylgS1anEr1BfU/OqBH2Nd/860T6oaLuDLU9EDdIpthix6DvFuKHkjX88JleQcgv+2tgmr0s7oSqJWRcypWZ5pSH4ybFJ+uLWi8QJ91zCyxldMsGnCChjirag=="
      })
    });
    
    const data = await res.json();
    if (data.code === 0) {
      const token = res.headers.get("Authorization");
      if (token) {
        localStorage.setItem("Authorization", token);
        console.log("[IFRAME] Login OK, token salvato");
      }
    }
  } catch (e) {
    console.error("[IFRAME] Login fallito:", e);
  }
}

// Esegui login all'avvio
// Esegui login all'avvio
if (typeof window !== 'undefined') {
  console.log('[IFRAME] shared-hooks caricato alle', new Date().toISOString());
  console.log('[IFRAME] Token presente all\'avvio?', localStorage.getItem('Authorization') ? 'SI' : 'NO');
  ensureIframeAuth();
}
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
  









const { send, answer, done, stopOutputMessage } = useSendMessageWithSse(
  `/v1/canvas/completion`,
  {
    headers: {
      Authorization: localStorage.getItem('Authorization') || "",
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    credentials: "include",
  },
  []
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
  [send, conversationId, derivedMessages, setValue, removeLatestMessage]
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

        // ← AGGIUNGI QUESTE 3 RIGHE:
    const token = localStorage.getItem('Authorization');
    console.log('[IFRAME] handlePressEnter chiamato alle', new Date().toISOString());
    console.log('[IFRAME] Token presente?', token ? 'SI: ' + token.substring(0, 20) : 'NO');

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
