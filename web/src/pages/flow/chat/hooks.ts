// C:\Users\user\ragflow\web\src\pages\flow\chat\hooks.ts

import { MessageType } from '@/constants/chat';
import { useFetchFlow } from '@/hooks/flow-hooks';
import {
  useHandleMessageInputChange,
  useSelectDerivedMessages,
  useSendMessageWithSse,
} from '@/hooks/logic-hooks';
import { Message } from '@/interfaces/database/chat';
import api from '@/utils/api';
import { message } from 'antd';
import trim from 'lodash/trim';
import { useCallback, useEffect } from 'react';
import { useParams } from 'umi';
import { v4 as uuid } from 'uuid';
import { receiveMessageError } from '../utils';

const antMessage = message;

/**
 * Hook per selezionare i messaggi e i riferimenti (reference) dal flow
 */
export const useSelectNextMessages = () => {
  const { data: flowDetail, loading } = useFetchFlow();

  // Se flowDetail o flowDetail.dsl è undefined, assegna un array vuoto.
  const reference = flowDetail?.dsl?.reference ?? [];

  const {
    derivedMessages,
    ref,
    addNewestQuestion,
    addNewestAnswer,
    removeLatestMessage,
    removeMessageById,
    removeMessagesAfterCurrentMessage,
  } = useSelectDerivedMessages();

  return {
    reference,
    loading,
    derivedMessages,
    ref,
    addNewestQuestion,
    addNewestAnswer,
    removeLatestMessage,
    removeMessageById,
    removeMessagesAfterCurrentMessage,
  };
};

/**
 * Hook per inviare messaggi con SSE, basato su useSelectNextMessages
 */
export const useSendNextMessage = () => {
  const {
    reference,
    loading,
    derivedMessages,
    ref,
    addNewestQuestion,
    addNewestAnswer,
    removeLatestMessage,
    removeMessageById,
  } = useSelectNextMessages();
  
  const { id: flowId } = useParams();
  const { handleInputChange, value, setValue } = useHandleMessageInputChange();
  const { refetch } = useFetchFlow();

  // Hook SSE
  const { send, answer, done } = useSendMessageWithSse(api.runCanvas);

  // Funzione per inviare il messaggio
  const sendMessage = useCallback(
    async ({ message }: { message: Message; messages?: Message[] }) => {
      const params: Record<string, unknown> = { id: flowId };
      if (message.content) {
        params.message = message.content;
        params.message_id = message.id;
      }
      const res = await send(params);

      if (receiveMessageError(res)) {
        antMessage.error(res?.data?.message);
        // Annulla il loading
        setValue(message.content);
        removeLatestMessage();
      } else {
        refetch(); // Ricarica la lista dei messaggi
      }
    },
    [flowId, send, setValue, removeLatestMessage, refetch],
  );

  const handleSendMessage = useCallback(
    async (msg: Message) => {
      sendMessage({ message: msg });
    },
    [sendMessage],
  );

  // Se abbiamo risposta dall’SSE, aggiunge la answer in derivedMessages
  useEffect(() => {
    if (answer.answer) {
      addNewestAnswer(answer);
    }
  }, [answer, addNewestAnswer]);

  // Funzione per inviare messaggi all’Enter
  const handlePressEnter = useCallback(() => {
    if (trim(value) === '') return;
    const id = uuid();
    if (done) {
      setValue('');
      handleSendMessage({ id, content: value.trim(), role: MessageType.User });
    }
    addNewestQuestion({
      content: value,
      id,
      role: MessageType.User,
    });
  }, [addNewestQuestion, handleSendMessage, done, setValue, value]);

  // Funzione per fetch iniziale (prologo)
  const fetchPrologue = useCallback(async () => {
    const sendRet = await send({ id: flowId });
    if (receiveMessageError(sendRet)) {
      message.error(sendRet?.data?.message);
    } else {
      refetch();
    }
  }, [flowId, refetch, send]);

  // Richiama prologo al mount
  useEffect(() => {
    fetchPrologue();
  }, [fetchPrologue]);

  return {
    handlePressEnter,
    handleInputChange,
    value,
    sendLoading: !done,    // loading SSE
    reference,             // fallback già pronto
    loading,               // loading di useFetchFlow
    derivedMessages,
    ref,
    removeMessageById,
  };
};
