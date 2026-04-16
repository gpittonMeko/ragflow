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
import {
  Checkbox,
  Flex,
  Popover,
  Segmented,
  Spin,
  Switch,
  Tooltip,
  Typography,
} from 'antd';
import get from 'lodash/get';
import { SlidersHorizontal } from 'lucide-react';
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

/** Maiuscola solo sulla prima lettera, resto minuscolo (etichette knowledge). */
function formatKnowledgeLabel(raw: string): string {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  return (
    t.charAt(0).toLocaleUpperCase('it-IT') +
    t.slice(1).toLocaleLowerCase('it-IT')
  );
}

/**
 * Modalità chunk lato documenti:
 * - standard: non invia `retrieval_top_n` (comportamento predefinito del canvas / agente).
 * - fast / extended: forza top_n ridotto o ampio.
 */
const RETRIEVAL_TOP_N_FORCED = { fast: 4, extended: 28 } as const;
type RetrievalMode = 'standard' | keyof typeof RETRIEVAL_TOP_N_FORCED;

function retrievalTopNForPayload(mode: RetrievalMode): number | undefined {
  if (mode === 'standard') return undefined;
  return RETRIEVAL_TOP_N_FORCED[mode];
}

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
  /** Popover portale: classi tema esplicite (evita `system` senza modulo CSS). */
  const embedOptsThemeClass = theme === 'light' ? styles.light : styles.dark;
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
      if (v === 'fast' || v === 'extended' || v === 'standard') return v;
      /* default: come prima dell’override client (nessun top_n forzato) */
      return 'standard';
    } catch {
      return 'standard';
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
        const raw = name ?? o.label;
        const label = formatKnowledgeLabel(raw);
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

  const kbOptionIdsKey = useMemo(
    () =>
      kbOptions
        .map((k) => k.id)
        .sort()
        .join('\n'),
    [kbOptions],
  );

  const prevKbOptionIdsKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevKbOptionIdsKeyRef.current === kbOptionIdsKey) return;
    prevKbOptionIdsKeyRef.current = kbOptionIdsKey;
    setEnabledKbIds(kbOptions.map((k) => k.id));
  }, [kbOptionIdsKey, kbOptions]);

  const getRetrievalKbIds = useCallback(() => {
    if (kbOptions.length <= 1) return undefined;
    if (enabledKbIds.length === 0) return undefined;
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
    getRetrievalTopN: () => retrievalTopNForPayload(retrievalMode),
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
    }, 4000);
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
        value: 'standard' as const,
        label: (
          <Tooltip
            title="Predefinito: non forza quanti chunk recuperare (impostazioni del canvas)."
            getPopupContainer={() => document.body}
          >
            <span className={styles.retrievalModeSegText}>Std</span>
          </Tooltip>
        ),
      },
      {
        value: 'fast' as const,
        label: (
          <Tooltip
            title="Circa 4 chunk dai documenti; risposta più rapida."
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
            title="Fino a 28 chunk dai documenti; più contesto (domande complesse)."
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
    <div
      className={`${styles.directChatLayoutRoot} ${!layoutExpanded ? styles.directChatLayoutRootCompact : ''}`}
    >
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
          /* Compatta: altezza da contenuto così non resta un “buco” nero sotto l’iframe */
          height: layoutExpanded ? '100%' : 'auto',
          paddingBottom: keyboardOffset > 0 ? keyboardOffset : undefined,
        }}
        vertical
      >
        <div
          ref={messageAreaRef}
          className={styles.messageContainer}
          style={{
            flex: layoutExpanded ? '1 1 0%' : '0 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              /* Compatta: niente margin-top auto (evita grande vuoto scuro sopra l’input) */
              marginTop: layoutExpanded ? 'auto' : 0,
              minWidth: 0,
            }}
          >
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
            flexShrink: layoutExpanded ? 0 : undefined,
            flex: layoutExpanded ? undefined : '1 1 auto',
            minHeight: layoutExpanded ? 'auto' : 0,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
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
              leadingActions={
                <Popover
                  open={embedOptsOpen}
                  onOpenChange={setEmbedOptsOpen}
                  trigger="click"
                  placement="topLeft"
                  arrow={false}
                  getPopupContainer={() => document.body}
                  overlayClassName={styles.directChatOptsPopover}
                  content={
                    <div
                      className={`${styles.chatContainer} ${embedOptsThemeClass} ${styles.directChatEmbed} ${styles.directChatOptsPopoverScaffold}`}
                    >
                      <div className={styles.directChatPopoverScroll}>
                        <div className={styles.directChatOptsBody}>
                          {directChatEmbedOptionsBody}
                        </div>
                      </div>
                    </div>
                  }
                >
                  <button
                    type="button"
                    className={styles.directChatOptsIconBtn}
                    aria-expanded={embedOptsOpen}
                    aria-label={
                      embedOptsOpen
                        ? 'Chiudi opzioni chat'
                        : 'Apri opzioni (web, documenti, basi)'
                    }
                    title={
                      embedOptsOpen
                        ? 'Chiudi opzioni'
                        : 'Web, documenti, filtro basi'
                    }
                  >
                    <SlidersHorizontal size={14} strokeWidth={2} aria-hidden />
                  </button>
                </Popover>
              }
              uploadHint={undefined}
              stopOutputMessage={stopOutputMessage}
              textareaAutoSize={{
                minRows: layoutExpanded ? 1 : 4,
                maxRows: layoutExpanded ? 24 : 16,
              }}
              embedComposerCompact={!layoutExpanded}
              wrapperRef={inputWrapperRef}
              onInputFocus={handleInputFocus}
              ghostSuggestionCycleKey={showGhost ? suggestionIndex : undefined}
              ghostSuggestion={showGhost ? ghostBody : null}
              ghostHint="⇧ Invio: usa il suggerimento."
              onGhostAccept={handleGhostAccept}
            />
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
