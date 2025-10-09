import { MessageType } from '@/constants/chat';
import { useCallback, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface Message {
  id: string;
  role: MessageType;
  content: string;
  reference?: any;
  doc_ids?: string[];
}

interface UseSendAgentMessage {
  value: string;
  loading: boolean;
  sendLoading: boolean;
  derivedMessages: Message[];
  handleInputChange: (value: string) => void;
  handlePressEnter: (e: any) => void;
  regenerateMessage: (messageId: string) => void;
  removeMessageById: (messageId: string) => void;
}

export const useSendAgentMessage = (
  agentId: string,
  onFirstGeneration?: () => void,
): UseSendAgentMessage => {
  const [value, setValue] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [sendLoading, setSendLoading] = useState<boolean>(false);
  const [derivedMessages, setDerivedMessages] = useState<Message[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hasGeneratedFirstMessage, setHasGeneratedFirstMessage] =
    useState<boolean>(false);

  const createAgentSession = useCallback(
    async (retryCount = 0): Promise<string | null> => {
      const maxRetries = 3;
      const delay = (retryCount + 1) * 1000; // Incremental delay: 1s, 2s, 3s

      try {
        const response = await fetch(`/api/v1/agents/${agentId}/sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm',
          },
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        if (
          data.code === 0 &&
          data.data &&
          (data.data.id || data.data.session_id)
        ) {
          const newSessionId = data.data.id || data.data.session_id;
          setSessionId(newSessionId);
          setDerivedMessages([
            {
              id: uuidv4(),
              role: MessageType.Assistant,
              content:
                data.data.message?.[0]?.content || 'Ciao! Come posso aiutarti?',
            },
          ]);
          return newSessionId;
        } else {
          throw new Error(
            `Session creation failed: ${data.message || 'Unknown error'}`,
          );
        }
      } catch (error) {
        if (retryCount < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          return createAgentSession(retryCount + 1);
        } else {
          setLoading(false);
          return null;
        }
      }
    },
    [agentId],
  );

  const sendAgentCompletion = useCallback(
    async (
      messageContent: string,
      currentSessionId: string | null,
      retryCount = 0,
    ) => {
      const maxRetries = 2;
      const delay = (retryCount + 1) * 1000; // Incremental delay: 1s, 2s

      if (!currentSessionId) {
        console.error('No session ID available');
        setSendLoading(false);
        return;
      }

      const newUserMessage: Message = {
        id: uuidv4(),
        role: MessageType.User,
        content: messageContent,
      };

      setDerivedMessages((prevMessages) => {
        const updatedMessages = [...prevMessages, newUserMessage];
        return updatedMessages;
      });
      setValue('');

      try {
        const currentMessages = derivedMessages;
        const messagesForAPI = [...currentMessages, newUserMessage].map(
          (msg) => ({
            role: msg.role,
            content: msg.content,
            doc_ids: msg.doc_ids || [],
          }),
        );

        const response = await fetch(`/api/v1/agents/${agentId}/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm',
          },
          body: JSON.stringify({
            question: messageContent,
            stream: false,
            session_id: currentSessionId,
            messages: messagesForAPI,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Read the full response text first
        const responseText = await response.text();

        // Parse as JSON
        const data = JSON.parse(responseText);
        setSendLoading(false);

        if (data.code === 0 && data.data) {
          const assistantMessage: Message = {
            id: uuidv4(),
            role: MessageType.Assistant,
            content: data.data.answer || "Risposta vuota dall'agente",
            reference: data.data.reference,
          };
          setDerivedMessages((prevMessages) => [
            ...prevMessages,
            assistantMessage,
          ]);

          if (!hasGeneratedFirstMessage && onFirstGeneration) {
            setHasGeneratedFirstMessage(true);
            onFirstGeneration();
          }
        } else {
          throw new Error(
            `Completion failed: ${data.message || 'Unknown error'}`,
          );
        }
      } catch (error) {
        if (retryCount < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          return sendAgentCompletion(
            messageContent,
            currentSessionId,
            retryCount + 1,
          );
        } else {
          setSendLoading(false);
          // Remove the user message that failed
          setDerivedMessages((prevMessages) => prevMessages.slice(0, -1));
          setValue(messageContent); // Restore the input
        }
      }
    },
    [agentId, hasGeneratedFirstMessage, onFirstGeneration, derivedMessages],
  );

  const handleInputChange = useCallback((newValue: string) => {
    setValue(newValue);
  }, []);

  const handlePressEnter = useCallback(
    async (e: any) => {
      if (e.key === 'Enter' && !e.shiftKey && value.trim()) {
        e.preventDefault();
        setSendLoading(true);

        let currentSessionId = sessionId;
        if (!currentSessionId) {
          setLoading(true);
          currentSessionId = await createAgentSession();
          setLoading(false);
        }

        if (currentSessionId) {
          await sendAgentCompletion(value.trim(), currentSessionId);
        } else {
          setSendLoading(false);
        }
      }
    },
    [value, sessionId, createAgentSession, sendAgentCompletion],
  );

  const regenerateMessage = useCallback(
    async (messageId: string) => {
      const messageIndex = derivedMessages.findIndex(
        (msg) => msg.id === messageId,
      );
      if (messageIndex === -1) return;

      const messagesUpToIndex = derivedMessages.slice(0, messageIndex);
      const lastUserMessage = messagesUpToIndex
        .reverse()
        .find((msg) => msg.role === MessageType.User);

      if (lastUserMessage) {
        setDerivedMessages(messagesUpToIndex.reverse());
        setSendLoading(true);
        await sendAgentCompletion(lastUserMessage.content, sessionId);
      }
    },
    [derivedMessages, sessionId, sendAgentCompletion],
  );

  const removeMessageById = useCallback((messageId: string) => {
    setDerivedMessages((prevMessages) =>
      prevMessages.filter((msg) => msg.id !== messageId),
    );
  }, []);

  return {
    value,
    loading,
    sendLoading,
    derivedMessages,
    handleInputChange,
    handlePressEnter,
    regenerateMessage,
    removeMessageById,
  };
};
