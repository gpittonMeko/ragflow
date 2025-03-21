// web/src/pages/flow/chat/hooks.ts

import {
  useFetchFlow,
  useHandleMessageInputChange,
  useSendMessageWithSse,
} from '@/hooks/logic-hooks';
import { Message } from '@/interfaces/database/chat';
import api from '@/utils/api';
import { message as antMessage } from 'antd';
import trim from 'lodash/trim';
import { useCallback, useEffect } from 'react';
import { useParams } from 'umi';
import { v4 as uuid } from 'uuid';
import { receiveMessageError } from '../utils';

interface UseSendNextMessageProps {
  agentId?: string; // dichiari l'agentId qui
}

// Seleziona i messaggi e reference (tuo hook, a titolo di esempio)
export const useSelectNextMessages = () => {
  const { data: flowDetail, loading } = useFetchFlow();
  const reference = flowDetail?.dsl?.reference ?? [];

  const {
    derivedMessages,
    ref,
    addNewestQuestion,
    removeLatestMessage,
    removeMessageById,
  } = useHandleMessagesFlow(reference);

  return {
    reference,
    loading,
    derivedMessages,
    ref,
    addNewestQuestion,
    removeLatestMessage,
    removeMessageById,
  };
};

// ECCO la parte critica:
export const useSendNextMessage = ({ agentId }: UseSendNextMessageProps) => {
  const {
    reference,
    loading,
    derivedMessages,
    ref,
    addNewestQuestion,
    removeLatestMessage,
    removeMessageById,
  } = useSelectNextMessages();

  const { id: flowId } = useParams(); // di solito l'ID del flow
  const { handleInputChange, value, setValue } = useHandleMessageInputChange();
  const { refetch } = useFetchFlow();
  const { send, answer, done } = useSendMessageWithSse(api.runCanvas);

  // FUNZIONE DI INVIO MESSAGGIO
  const sendMessage = useCallback(
    async ({ message }: { message: Message; messages?: Message[] }) => {
      // Parametri base che il server si aspetta
      const params: Record<string, unknown> = { id: flowId };

      // QUI devi aggiungere o decommentare questa parte
      if (agentId) {
        params.agentId = agentId; 
      }

      if (message.content) {
        params.message = message.content;
        params.message_id = message.id;
      }

      // chiamata SSE
      const res = await send(params);

      if (receiveMessageError(res)) {
        antMessage.error(res?.data?.message);
        // Annulla lo "spinner"
        setValue(message.content);
        removeLatestMessage();
      } else {
        // Se tutto OK, ricarica i dati
        refetch();
      }
    },
    [flowId, send, setValue, removeLatestMessage, refetch, agentId]
  );

  // GESTIONE DI INVIO MESSAGGIO
  const handleSendMessage = useCallback(
    async (msg: Message) => {
      sendMessage({ message: msg });
    },
    [sendMessage]
  );

  // EFFETTO: quando `done === true`, invia la domanda
  useEffect(() => {
    if (done && answer && trim(value) !== '') {
      addNewestQuestion(value);
      setValue('');
      handleSendMessage({
        id: uuid(),
        role: 'user',
        content: value,
      });
    }
  }, [addNewestQuestion, handleSendMessage, done, setValue, value, answer]);

  // FACOLTATIVO: fetch "prologo"
  const fetchPrologue = useCallback(async () => {
    const sendRet = await send({ id: flowId });
    if (receiveMessageError(sendRet)) {
      antMessage.error(sendRet?.data?.message);
    } else {
      refetch();
    }
  }, [flowId, send, refetch]);

  return {
    reference,
    loading,
    derivedMessages,
    ref,
    value,
    handleInputChange,
    handleSendMessage,
    removeMessageById,
    removeLatestMessage,
    fetchPrologue,
    done,
    answer,
    sendLoading: loading, // se vuoi un booleano di caricamento
  };
};
