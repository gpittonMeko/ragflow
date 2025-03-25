import { MessageType } from '@/constants/chat';
import { IConversation, IReference } from '@/interfaces/database/chat';
import { isEmpty } from 'lodash';
import { EmptyConversationId } from './constants';
import { IMessage } from './interface';

export const isConversationIdExist = (conversationId: string) => {
  return conversationId !== EmptyConversationId && conversationId !== '';
};

export const getDocumentIdsFromConversionReference = (data: IConversation) => {
  const documentIds = data.reference.reduce(
    (pre: Array<string>, cur: IReference) => {
      cur.doc_aggs
        ?.map((x) => x.doc_id)
        .forEach((x) => {
          if (pre.every((y) => y !== x)) {
            pre.push(x);
          }
        });
      return pre;
    },
    [],
  );
  return documentIds.join(',');
};

export const buildMessageItemReference = (
  conversation: { message: IMessage; reference: any }, // Aggiorna il tipo di reference a 'any' o al tipo corretto
  message: IMessage,
) => {
  // Non abbiamo più bisogno di filtrare o cercare per indice a meno che la tua API non restituisca una reference per ogni messaggio.
  // Se la reference è un singolo oggetto per l'intera risposta, usala direttamente.
  const reference = conversation?.reference;

  return reference ?? { doc_aggs: undefined, chunks: undefined, total: 0 };
};

const oldReg = /(#{2}\d+\${2})/g;

// To be compatible with the old index matching mode
export const replaceTextByOldReg = (text: string) => {
  return text.replace(oldReg, function (substring) {
    return `~~${substring.slice(2, -2)}==`;
  });
};
