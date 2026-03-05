import MessageInput from '@/components/message-input';
import MessageItem from '@/components/message-item';
import PdfDrawer from '@/components/pdf-drawer';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';
import { useTheme } from '@/components/theme-provider';
import { MessageType } from '@/constants/chat';
import { useFetchFlowSSE } from '@/hooks/flow-hooks';
import {
  useSendButtonDisabled,
  useSendSharedMessage,
} from '@/pages/chat/shared-hooks';
import { buildMessageItemReference } from '@/pages/chat/utils';
import { buildMessageUuidWithRole } from '@/utils/chat';
import { Flex, Spin } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'umi';
import styles from '../chat/share/index.less';

// Hook per adattare layout quando si apre la tastiera su mobile
function useKeyboardOffset() {
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const initialHeight = useRef(
    typeof window !== 'undefined' ? window.innerHeight : 0,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;

    const handler = () => {
      const diff = initialHeight.current - vv.height;
      setKeyboardOffset(diff > 80 ? diff : 0);
    };
    vv.addEventListener('resize', handler);
    vv.addEventListener('scroll', handler);
    handler();
    return () => {
      vv.removeEventListener('resize', handler);
      vv.removeEventListener('scroll', handler);
    };
  }, []);

  return keyboardOffset;
}

interface DirectChatProps {
  agentId: string;
  sessionId?: string; // ✅ Session ID unico per ogni browser
  className?: string;
  style?: React.CSSProperties;
  onMessagesChange?: (count: number) => void;
  onGenerationComplete?: () => void;
  onChatUpdate?: (title: string, lastMessage: string) => void; // ✅ Callback per aggiornare chat history
}

const DirectChat: React.FC<DirectChatProps> = ({
  agentId,
  sessionId,
  className,
  style,
  onMessagesChange,
  onGenerationComplete,
  onChatUpdate,
}) => {
  const { theme } = useTheme();
  const location = useLocation();

  // Imposta i parametri URL necessari per useSendSharedMessage (solo query params, NON cambia pathname)
  useEffect(() => {
    const currentParams = new URLSearchParams(location.search);
    const needsUpdate =
      currentParams.get('shared_id') !== agentId ||
      currentParams.get('from') !== 'agent' ||
      currentParams.get('visible_avatar') !== '0';

    if (needsUpdate) {
      // Mantieni tutti i parametri esistenti e aggiungi/sovrascrivi solo quelli necessari
      const newParams = new URLSearchParams(location.search);
      newParams.set('shared_id', agentId);
      newParams.set('from', 'agent');
      newParams.set('visible_avatar', '0');

      // Usa replaceState direttamente per non triggerare navigazione
      const newUrl = `${location.pathname}?${newParams.toString()}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, [agentId, location.pathname, location.search]);

  // ✅ Passa agentId E sessionId per gestire conversazioni separate
  const {
    handlePressEnter,
    handleInputChange,
    value,
    sendLoading,
    ref,
    loading,
    derivedMessages,
    hasError,
    stopOutputMessage,
    setDerivedMessages,
  } = useSendSharedMessage(agentId, sessionId);

  const { visible, hideModal, documentId, selectedChunk, clickDocumentButton } =
    useClickDrawer();
  const sendDisabled = useSendButtonDisabled(value);

  const [progress, setProgress] = useState(0);
  const [barVisible, setBarVisible] = useState(false);
  const isGeneratingRef = useRef(false);
  const SIMULATED_TOTAL_MS = 180000; // 3 minuti

  // Fetch avatar data - useFetchFlowSSE reads sharedId from URL params (set in useEffect above)
  const { data: avatarData } = useFetchFlowSSE();

  // Progress bar logic
  useEffect(() => {
    let interval: any = null;
    const START = Date.now();

    if (sendLoading) {
      isGeneratingRef.current = true;
      setBarVisible(true);
      setProgress(0);

      interval = setInterval(() => {
        const elapsed = Date.now() - START;
        const target = Math.min(90, (elapsed / SIMULATED_TOTAL_MS) * 90);
        setProgress(target);
      }, 200);
    } else {
      if (isGeneratingRef.current) {
        isGeneratingRef.current = false;
        // Notify parent that generation is complete
        if (onGenerationComplete) {
          onGenerationComplete();
        }
      }
      setProgress(100);
      setTimeout(() => setBarVisible(false), 650);
      setTimeout(() => setProgress(0), 1200);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sendLoading, onGenerationComplete]);

  // Notify parent when messages change
  useEffect(() => {
    if (onMessagesChange && derivedMessages) {
      onMessagesChange(derivedMessages.length);
    }
  }, [derivedMessages, onMessagesChange]);

  // Update chat history when messages change
  useEffect(() => {
    if (onChatUpdate && derivedMessages && derivedMessages.length > 0) {
      const lastMessage = derivedMessages[derivedMessages.length - 1];
      if (lastMessage && lastMessage.content) {
        // Generate title from first user message
        const firstUserMessage = derivedMessages.find(
          (msg) => msg.role === 'user',
        );
        const title =
          firstUserMessage?.content?.slice(0, 50) + '...' || 'Nuova Chat';

        // Get last message content
        const lastMessageContent = lastMessage.content.slice(0, 100) + '...';

        onChatUpdate(title, lastMessageContent);
      }
    }
  }, [derivedMessages, onChatUpdate]);

  // Load historical messages when sessionId changes
  const prevSessionIdRef = useRef<string | undefined>(sessionId);
  useEffect(() => {
    if (
      prevSessionIdRef.current &&
      prevSessionIdRef.current !== sessionId &&
      sessionId
    ) {
      console.log(
        '[DirectChat] SessionId changed from',
        prevSessionIdRef.current,
        'to',
        sessionId,
        '- loading messages',
      );

      // Load messages from backend
      const loadHistoricalMessages = async () => {
        try {
          const response = await fetch(
            `/v1/canvas/session/${agentId}/${sessionId}`,
          );
          if (response.ok) {
            const result = await response.json();
            if (result.code === 0 && result.data?.messages) {
              console.log(
                '[DirectChat] Loaded',
                result.data.messages.length,
                'historical messages',
              );
              setDerivedMessages(result.data.messages);
            } else {
              console.log(
                '[DirectChat] No historical messages found, resetting',
              );
              setDerivedMessages([]);
            }
          } else {
            console.error(
              '[DirectChat] Failed to load messages:',
              response.status,
            );
            setDerivedMessages([]);
          }
        } catch (error) {
          console.error('[DirectChat] Error loading messages:', error);
          setDerivedMessages([]);
        }
      };

      void loadHistoricalMessages();
    }
    prevSessionIdRef.current = sessionId;
  }, [sessionId, agentId, setDerivedMessages]);

  const lastMessageIndex = derivedMessages ? derivedMessages.length - 1 : -1;
  const keyboardOffset = useKeyboardOffset();
  const inputWrapperRef = useRef<HTMLDivElement>(null);

  return (
    <>
      {barVisible && (
        <div className={styles.loaderBarWrapper}>
          <div className={styles.loaderGlass}>
            <span className={styles.loaderGlassText}>
              Generazione in corso...
            </span>
            <div
              className={styles.loaderBarLiquid}
              style={{
                width: '100%',
                maxWidth: 400,
                minWidth: 80,
                margin: '0 auto',
                height: 4,
                background: 'var(--border-color, #e0e0e0)',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div
                className={styles.loaderBarLiquidInner}
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  borderRadius: 2,
                  background: 'var(--accent-color, #0f62fe)',
                  transition: 'width 0.3s ease',
                }}
              ></div>
            </div>
          </div>
        </div>
      )}

      <Flex
        flex={1}
        className={`${styles.chatContainer} ${styles[theme]} ${className}`}
        style={{
          ...style,
          paddingBottom: keyboardOffset > 0 ? keyboardOffset : undefined,
        }}
        vertical
      >
        <Flex flex={1} vertical className={styles.messageContainer}>
          <div>
            <Spin spinning={loading}>
              {derivedMessages?.map((message, i) => {
                const isLastMessage = i === lastMessageIndex;
                return (
                  <div key={buildMessageUuidWithRole(message)}>
                    <MessageItem
                      visibleAvatar={false}
                      avatarDialog={avatarData?.avatar}
                      item={message}
                      nickname="You"
                      reference={buildMessageItemReference(
                        {
                          message: derivedMessages,
                          reference: [],
                        },
                        message,
                      )}
                      loading={
                        message.role === MessageType.Assistant &&
                        sendLoading &&
                        isLastMessage
                      }
                      index={i}
                      clickDocumentButton={clickDocumentButton}
                      showLikeButton={false}
                      showLoudspeaker={false}
                    />
                  </div>
                );
              })}
            </Spin>
          </div>
          <div ref={ref} />
        </Flex>

        <MessageInput
          isShared
          value={value}
          disabled={false}
          sendDisabled={sendDisabled || sendLoading}
          conversationId={agentId}
          onInputChange={handleInputChange}
          onPressEnter={handlePressEnter}
          sendLoading={sendLoading}
          uploadMethod="external_upload_and_parse"
          showUploadIcon={false}
          stopOutputMessage={stopOutputMessage}
          autoFocus={false}
          wrapperRef={inputWrapperRef}
        />
      </Flex>

      {visible && (
        <PdfDrawer
          visible={visible}
          hideModal={hideModal}
          documentId={documentId}
          chunk={selectedChunk}
        />
      )}
    </>
  );
};

export default DirectChat;
