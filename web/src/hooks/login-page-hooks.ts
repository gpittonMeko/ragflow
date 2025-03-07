import { useEffect } from 'react';
import { useSearchParams } from 'umi';
import { getConversationId } from '@/utils/chat';
import { ChatSearchParams } from '@/constants/chat';

export const useEnsureConversationId = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationId = searchParams.get(ChatSearchParams.ConversationId) || '';

  useEffect(() => {
    if (!conversationId) {
      const newId = getConversationId();
      searchParams.set(ChatSearchParams.ConversationId, newId);
      // Puoi impostare anche altri parametri se necessario, ad esempio "isNew"
      setSearchParams(searchParams);
      console.log('Nuovo conversationId generato:', newId);
    }
  }, [conversationId, searchParams, setSearchParams]);
};
