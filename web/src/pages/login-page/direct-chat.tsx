import MessageInput from '@/components/message-input';
import MessageItem from '@/components/message-item';
import PdfDrawer from '@/components/pdf-drawer';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';
import { useTheme } from '@/components/theme-provider';
import { MessageType } from '@/constants/chat';
import { useFetchFlowSSE } from '@/hooks/flow-hooks';
import { useSharedGenerationProgress } from '@/hooks/use-shared-generation-progress';
import {
  useSendButtonDisabled,
  useSendSharedMessage,
} from '@/pages/chat/shared-hooks';
import { buildMessageItemReference } from '@/pages/chat/utils';
import { buildMessageUuidWithRole } from '@/utils/chat';
import { Button, Flex, Spin, Typography } from 'antd';
import { FileText, Scale, Search, Shield } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'umi';
import styles from '../chat/share/index.less';
import {
  SGAI_APPLICATION_CARDS,
  SHARED_SUGGESTED_PROMPTS,
} from './shared-suggested-prompts';

const APP_ICON_MAP = {
  'modulo-contenzioso': Scale,
  'modulo-compliance': Shield,
  'modulo-contratti': FileText,
  'modulo-ricerca': Search,
} as const;

// Compatta: nessun inset. Espansa: spazio sotto = area coperta da tastiera (visualViewport, ok su iOS/Android).
function useKeyboardOffset(omitInset: boolean) {
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;

    const handler = () => {
      if (omitInset) {
        setKeyboardOffset(0);
        return;
      }
      const innerH = window.innerHeight;
      const inset = Math.max(0, innerH - vv.height - vv.offsetTop);
      setKeyboardOffset(inset > 32 ? inset + 12 : 0);
    };

    vv.addEventListener('resize', handler);
    vv.addEventListener('scroll', handler);
    window.addEventListener('resize', handler);
    const t = requestAnimationFrame(handler);
    return () => {
      cancelAnimationFrame(t);
      vv.removeEventListener('resize', handler);
      vv.removeEventListener('scroll', handler);
      window.removeEventListener('resize', handler);
    };
  }, [omitInset]);

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
  /** Chat compatto: disattiva paddingBottom da visualViewport */
  omitKeyboardInset?: boolean;
  /** Chat a schermo intero: scroll messaggi/input all’apertura */
  layoutExpanded?: boolean;
}

const DirectChat: React.FC<DirectChatProps> = ({
  agentId,
  sessionId,
  className,
  style,
  onMessagesChange,
  onGenerationComplete,
  onChatUpdate,
  omitKeyboardInset = false,
  layoutExpanded = false,
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
    setValue,
    sendLoading,
    ref,
    loading,
    derivedMessages,
    hasError,
    stopOutputMessage,
    setDerivedMessages,
    isGenerating,
    answer,
  } = useSendSharedMessage(agentId, sessionId);

  const { visible, hideModal, documentId, selectedChunk, clickDocumentButton } =
    useClickDrawer();
  const sendDisabled = useSendButtonDisabled(value);

  // Fetch avatar data - useFetchFlowSSE reads sharedId from URL params (set in useEffect above)
  const { data: avatarData } = useFetchFlowSSE();

  const { progress, barVisible, phaseLabel } = useSharedGenerationProgress(
    sendLoading,
    isGenerating,
    answer,
    {
      onBusyEnd: () => onGenerationComplete?.(),
    },
  );

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
  const keyboardOffset = useKeyboardOffset(omitKeyboardInset);
  const inputWrapperRef = useRef<HTMLDivElement>(null);
  const messageAreaRef = useRef<HTMLDivElement>(null);
  const prevLayoutExpanded = useRef(false);

  const scrollMessagesToBottom = () => {
    const el = messageAreaRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    scrollMessagesToBottom();
  }, [derivedMessages?.length, sendLoading]);

  useEffect(() => {
    if (layoutExpanded && !prevLayoutExpanded.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollMessagesToBottom();
          inputWrapperRef.current?.scrollIntoView({
            block: 'end',
            behavior: 'smooth',
          });
        });
      });
    }
    prevLayoutExpanded.current = layoutExpanded;
  }, [layoutExpanded]);

  const handleInputFocus = () => {
    scrollMessagesToBottom();
    requestAnimationFrame(() => {
      inputWrapperRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    });
  };

  return (
    <div className={styles.directChatLayoutRoot}>
      {barVisible && (
        <div className={styles.loaderBarWrapper}>
          <div className={styles.loaderGlass}>
            <div className={styles.loaderSpinner} />
            <span className={styles.loaderGlassText}>{phaseLabel}</span>
            <div
              className={styles.loaderBarLiquid}
              style={{
                height: 3,
                background: 'var(--border-color)',
                borderRadius: 2,
                overflow: 'hidden',
                flex: 1,
                minWidth: 72,
              }}
            >
              <div
                className={styles.loaderBarLiquidInner}
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  borderRadius: 2,
                  transition: 'width 0.35s ease',
                }}
              />
            </div>
          </div>
        </div>
      )}

      <Flex
        flex={1}
        className={`${styles.chatContainer} ${styles[theme]} ${styles.directChatEmbed} ${className ?? ''}`}
        style={{
          ...style,
          minHeight: 0,
          height: '100%',
          paddingBottom: keyboardOffset > 0 ? keyboardOffset : undefined,
        }}
        vertical
      >
        <div
          ref={messageAreaRef}
          className={styles.messageContainer}
          style={{
            flex: '1 1 0%',
            minHeight: 0,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ marginTop: 'auto', minWidth: 0 }}>
            <Spin
              spinning={loading}
              tip={loading ? 'Caricamento della conversazione' : undefined}
              indicator={<div className={styles.loaderSpinner} />}
            >
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
            <div ref={ref} />
          </div>
        </div>

        <div
          className={styles.directChatInputColumn}
          style={{ flexShrink: 0, width: '100%' }}
        >
          {(!derivedMessages || derivedMessages.length === 0) &&
            !sendLoading && (
              <div className={styles.suggestedChipsSection}>
                <Typography.Text
                  type="secondary"
                  className={styles.sgaiApplicationsLead}
                >
                  Scegli un modulo, uno scenario guidato o scrivi la tua
                  domanda. Puoi allegare documenti con il pulsante «Allega».
                </Typography.Text>
                <Typography.Text className={styles.sgaiApplicationsTitle}>
                  Applicazioni
                </Typography.Text>
                <div className={styles.sgaiApplicationsGrid}>
                  {SGAI_APPLICATION_CARDS.map((app) => {
                    const IconCmp =
                      APP_ICON_MAP[app.id as keyof typeof APP_ICON_MAP] ||
                      FileText;
                    return (
                      <button
                        key={app.id}
                        type="button"
                        className={styles.sgaiAppCard}
                        onClick={() => {
                          setValue(app.body);
                          requestAnimationFrame(() => {
                            inputWrapperRef.current?.scrollIntoView({
                              block: 'nearest',
                              behavior: 'smooth',
                            });
                          });
                        }}
                      >
                        <span className={styles.sgaiAppCardIcon} aria-hidden>
                          <IconCmp size={18} strokeWidth={2} />
                        </span>
                        <span className={styles.sgaiAppCardTitle}>
                          {app.title}
                        </span>
                        <span className={styles.sgaiAppCardSub}>
                          {app.subtitle}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <Typography.Text
                  type="secondary"
                  className={styles.suggestedChipsHint}
                >
                  Scenari guidati (giurisprudenza / tributario)
                </Typography.Text>
                <div className={styles.suggestedChipsRow}>
                  {SHARED_SUGGESTED_PROMPTS.map((p) => (
                    <Button
                      key={p.id}
                      size="small"
                      type="default"
                      className={styles.suggestedChip}
                      onClick={() => {
                        setValue(p.body);
                        requestAnimationFrame(() => {
                          inputWrapperRef.current?.scrollIntoView({
                            block: 'nearest',
                            behavior: 'smooth',
                          });
                        });
                      }}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
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
            showUploadIcon={true}
            showAttachLabel
            uploadHint="Usa «Allega» per caricare PDF o altri documenti: dopo il parsing entrano nel contesto del messaggio."
            stopOutputMessage={stopOutputMessage}
            autoFocus={false}
            wrapperRef={inputWrapperRef}
            onInputFocus={handleInputFocus}
          />
        </div>
      </Flex>

      {visible && (
        <PdfDrawer
          visible={visible}
          hideModal={hideModal}
          documentId={documentId}
          chunk={selectedChunk}
        />
      )}
    </div>
  );
};

export default DirectChat;
