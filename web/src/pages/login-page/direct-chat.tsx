import MessageInput from '@/components/message-input';
import MessageItem from '@/components/message-item';
import PdfDrawer from '@/components/pdf-drawer';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';
import { useTheme } from '@/components/theme-provider';
import { MessageType } from '@/constants/chat';
import { useFetchFlowSSE } from '@/hooks/flow-hooks';
import { useSharedGenerationProgress } from '@/hooks/use-shared-generation-progress';
import { cn } from '@/lib/utils';
import {
  useSendButtonDisabled,
  useSendSharedMessage,
} from '@/pages/chat/shared-hooks';
import { buildMessageItemReference } from '@/pages/chat/utils';
import { buildMessageUuidWithRole } from '@/utils/chat';
import {
  Checkbox,
  Flex,
  Segmented,
  Spin,
  Switch,
  Tooltip,
  Typography,
} from 'antd';
import get from 'lodash/get';
import { ChevronDown } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation } from 'umi';
import styles from '../chat/share/index.less';
import { extractRetrievalKbOptions } from './direct-chat-knowledge';
import { SHARED_SUGGESTED_PROMPTS } from './shared-suggested-prompts';
import { useKbDisplayNames } from './use-kb-display-names';

const SGAI_DEEP_SEARCH_KEY = 'sgai-deep-search';
const SGAI_RETRIEVAL_MODE_KEY = 'sgai-retrieval-mode';

/** Modalità ricerca chunk: valori inviati come retrieval_top_n al canvas */
const RETRIEVAL_TOP_N = { fast: 4, extended: 16 } as const;
type RetrievalMode = keyof typeof RETRIEVAL_TOP_N;

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

  const [deepSearch, setDeepSearch] = useState(() => {
    try {
      return (
        typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem(SGAI_DEEP_SEARCH_KEY) === '1'
      );
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(SGAI_DEEP_SEARCH_KEY, deepSearch ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [deepSearch]);

  const [retrievalMode, setRetrievalMode] = useState<RetrievalMode>(() => {
    try {
      const v =
        typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem(SGAI_RETRIEVAL_MODE_KEY);
      return v === 'fast' ? 'fast' : 'extended';
    } catch {
      return 'extended';
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(SGAI_RETRIEVAL_MODE_KEY, retrievalMode);
    } catch {
      /* ignore */
    }
  }, [retrievalMode]);

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

  // Fetch avatar + DSL (shared_id da URL, impostato sopra)
  const { data: avatarData } = useFetchFlowSSE();

  const kbOptions = useMemo(
    () => extractRetrievalKbOptions(get(avatarData, 'dsl')),
    [avatarData],
  );

  const kbNameById = useKbDisplayNames(kbOptions.map((k) => k.id));

  const kbCheckboxOptions = useMemo(
    () =>
      kbOptions.map((o) => {
        const name = kbNameById.get(o.id);
        const label = name ?? o.label;
        return {
          label: (
            <Typography.Text
              ellipsis={{ tooltip: label }}
              className={styles.kbCheckboxLabel}
            >
              {label}
            </Typography.Text>
          ),
          value: o.id,
        };
      }),
    [kbOptions, kbNameById],
  );

  const [enabledKbIds, setEnabledKbIds] = useState<string[]>([]);
  const [embedOptsOpen, setEmbedOptsOpen] = useState(false);

  useEffect(() => {
    setEnabledKbIds(kbOptions.map((k) => k.id));
  }, [kbOptions]);

  const getRetrievalKbIds = useCallback(() => {
    if (kbOptions.length <= 1) return undefined;
    const all = kbOptions.map((k) => k.id);
    if (enabledKbIds.length === 0 || enabledKbIds.length === all.length) {
      return undefined;
    }
    return enabledKbIds.join(',');
  }, [kbOptions, enabledKbIds]);

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
  } = useSendSharedMessage(agentId, sessionId, {
    getDeepSearch: () => deepSearch,
    getRetrievalKbIds,
    getRetrievalTopN: () => RETRIEVAL_TOP_N[retrievalMode],
  });

  const { visible, hideModal, documentId, selectedChunk, clickDocumentButton } =
    useClickDrawer();
  const sendDisabled = useSendButtonDisabled(value);

  const [suggestionIndex, setSuggestionIndex] = useState(0);

  const idleForGhost =
    (!derivedMessages || derivedMessages.length === 0) && !sendLoading;
  const showGhost = idleForGhost && !value.trim();

  useEffect(() => {
    if (!showGhost || SHARED_SUGGESTED_PROMPTS.length <= 1) return;
    const id = window.setInterval(() => {
      setSuggestionIndex((i) => (i + 1) % SHARED_SUGGESTED_PROMPTS.length);
    }, 12000);
    return () => clearInterval(id);
  }, [showGhost]);

  const ghostBody = SHARED_SUGGESTED_PROMPTS[suggestionIndex]?.body ?? '';

  const handleGhostAccept = useCallback(() => {
    if (ghostBody) setValue(ghostBody);
  }, [ghostBody, setValue]);

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
      // Load messages from backend
      const loadHistoricalMessages = async () => {
        try {
          const response = await fetch(
            `/v1/canvas/session/${agentId}/${sessionId}`,
          );
          if (response.ok) {
            const result = await response.json();
            if (result.code === 0 && result.data?.messages) {
              setDerivedMessages(result.data.messages);
            } else {
              setDerivedMessages([]);
            }
          } else {
            setDerivedMessages([]);
          }
        } catch {
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
    // Evita scroll della pagina quando la chat è compatta (embed): causava “salti” prima dell’apertura fullscreen
    if (!layoutExpanded) return;
    requestAnimationFrame(() => {
      inputWrapperRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    });
  };

  const retrievalSegmentedOptions = useMemo(
    () => [
      {
        value: 'fast' as const,
        label: (
          <Tooltip
            title="Meno chunk dai documenti, risposta più rapida."
            getPopupContainer={() => document.body}
          >
            <span className={styles.retrievalModeSegText}>Fast</span>
          </Tooltip>
        ),
      },
      {
        value: 'extended' as const,
        label: (
          <Tooltip
            title="Più chunk dai documenti (consigliato per domande complesse)."
            getPopupContainer={() => document.body}
          >
            <span className={styles.retrievalModeSegText}>Deep</span>
          </Tooltip>
        ),
      },
    ],
    [],
  );

  const directChatEmbedOptionsBody = useMemo(
    () => (
      <div className={styles.directChatOptsInner}>
        <div className={styles.controlsToolbar}>
          <div className={styles.deepSearchRow}>
            <Tooltip
              title="Aggiunge estratti da web (Tavily o fallback) al contesto lato server, senza cambiare il testo che invii."
              getPopupContainer={() => document.body}
            >
              <span className={styles.deepSearchSwitchWrap}>
                <Switch
                  id="sgai-deep-search-toggle"
                  checked={deepSearch}
                  onChange={setDeepSearch}
                  size="small"
                />
              </span>
            </Tooltip>
            <div className={styles.deepSearchTextCol}>
              <label
                htmlFor="sgai-deep-search-toggle"
                className={styles.deepSearchLabel}
              >
                Web
              </label>
              <span className={styles.deepSearchSub}>Fonti online</span>
            </div>
          </div>
          <div className={styles.retrievalModeRow}>
            <div className={styles.retrievalModeHead}>
              <Typography.Text className={styles.retrievalModeLabel}>
                Documenti
              </Typography.Text>
              <Segmented<RetrievalMode>
                size="small"
                value={retrievalMode}
                onChange={(v) => setRetrievalMode(v as RetrievalMode)}
                options={[...retrievalSegmentedOptions]}
                className={styles.retrievalModeSegmented}
              />
            </div>
          </div>
          {kbOptions.length >= 1 ? (
            <div className={styles.kbFilterBlock}>
              <Typography.Text className={styles.kbFilterLabel}>
                Basi
              </Typography.Text>
              <Typography.Text type="secondary" className={styles.kbFilterSub}>
                {kbOptions.length > 1
                  ? 'Filtra le knowledge attive.'
                  : 'Collegata all’agente.'}
              </Typography.Text>
              <Checkbox.Group
                className={styles.kbFilterGroup}
                value={enabledKbIds}
                onChange={(v) => setEnabledKbIds(v as string[])}
                options={kbCheckboxOptions}
              />
            </div>
          ) : null}
        </div>
      </div>
    ),
    [
      deepSearch,
      retrievalMode,
      kbOptions.length,
      enabledKbIds,
      kbCheckboxOptions,
      retrievalSegmentedOptions,
    ],
  );

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
        className={`${styles.chatContainer} ${styles[theme]} ${styles.directChatEmbed} ${!layoutExpanded ? styles.directChatEmbedCompact : ''} ${className ?? ''}`}
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
                      embedChat
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
          style={{
            flexShrink: layoutExpanded ? 1 : 0,
            minHeight: 0,
            width: '100%',
          }}
        >
          <div className={styles.directChatInputRow}>
            <div className={styles.directChatOptsRail}>
              <div
                className={cn(
                  styles.embedGlassPanel,
                  !embedOptsOpen && styles.embedGlassPanelCollapsed,
                )}
              >
                <button
                  type="button"
                  className={styles.directChatOptsToggle}
                  onClick={() => setEmbedOptsOpen((o) => !o)}
                  aria-expanded={embedOptsOpen}
                >
                  <span className={styles.directChatOptsToggleLabel}>
                    {embedOptsOpen ? 'Chiudi' : 'Opzioni'}
                  </span>
                  <ChevronDown
                    className={cn(
                      styles.directChatOptsChevron,
                      embedOptsOpen && styles.directChatOptsChevronOpen,
                    )}
                    size={14}
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
                {embedOptsOpen ? (
                  <div className={styles.directChatOptsBody}>
                    {directChatEmbedOptionsBody}
                  </div>
                ) : null}
              </div>
            </div>
            <div className={styles.embedChatInputShell}>
              <MessageInput
                isShared
                value={value}
                disabled={false}
                sendDisabled={sendDisabled || sendLoading}
                conversationId={sessionId ?? ''}
                onInputChange={handleInputChange}
                onPressEnter={handlePressEnter}
                sendLoading={sendLoading}
                uploadMethod="upload_and_parse"
                showUploadIcon={true}
                showAttachLabel
                uploadHint={
                  showGhost
                    ? 'Allega PDF/DOCX (parsing → retrieval).'
                    : 'Allega PDF/DOCX: dopo indicizzazione il testo entra in analisi.'
                }
                stopOutputMessage={stopOutputMessage}
                textareaAutoSize={{ minRows: 2, maxRows: 16 }}
                wrapperRef={inputWrapperRef}
                onInputFocus={handleInputFocus}
                ghostSuggestion={showGhost ? ghostBody : null}
                ghostHint="⇧ Invio: usa il suggerimento."
                onGhostAccept={handleGhostAccept}
              />
            </div>
          </div>
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
