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

interface DirectChatProps {
  agentId: string;
  className?: string;
  style?: React.CSSProperties;
  onMessageSent?: () => void; // Callback per incrementare il counter
}

const DirectChat: React.FC<DirectChatProps> = ({
  agentId,
  className,
  style,
  onMessageSent,
}) => {
  const { theme } = useTheme();
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(false);

  // Imposta i parametri URL necessari per useSendSharedMessage (solo query params, NON cambia pathname)
  useEffect(() => {
    const currentParams = new URLSearchParams(location.search);
    const needsUpdate =
      currentParams.get('shared_id') !== agentId ||
      currentParams.get('from') !== 'agent' ||
      currentParams.get('visible_avatar') !== '1';

    if (needsUpdate) {
      // Mantieni tutti i parametri esistenti e aggiungi/sovrascrivi solo quelli necessari
      const newParams = new URLSearchParams(location.search);
      newParams.set('shared_id', agentId);
      newParams.set('from', 'agent');
      newParams.set('visible_avatar', '1');

      // Usa replaceState direttamente per non triggerare navigazione
      const newUrl = `${location.pathname}?${newParams.toString()}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, [agentId, location.pathname, location.search]);

  const {
    handlePressEnter: originalHandlePressEnter,
    handleInputChange,
    value,
    sendLoading,
    ref,
    loading,
    derivedMessages,
    hasError,
    stopOutputMessage,
  } = useSendSharedMessage();

  // Wrapper per handlePressEnter che gestisce counter e espansione
  const handlePressEnter = React.useCallback(
    (documentIds: string[]) => {
      if (value.trim()) {
        // Espandi la chat al primo messaggio
        if (!isExpanded) {
          setIsExpanded(true);
        }
        // Incrementa il counter
        if (onMessageSent) {
          onMessageSent();
        }
      }
      // Chiama l'handler originale
      originalHandlePressEnter(documentIds);
    },
    [value, isExpanded, onMessageSent, originalHandlePressEnter],
  );

  const { visible, hideModal, documentId, selectedChunk, clickDocumentButton } =
    useClickDrawer();
  const sendDisabled = useSendButtonDisabled(value);

  const [progress, setProgress] = useState(0);
  const [barVisible, setBarVisible] = useState(false);
  const isGeneratingRef = useRef(false);
  const SIMULATED_TOTAL_MS = 180000; // 3 minuti

  // Fetch avatar data
  const { data: avatarData } = useFetchFlowSSE(agentId);

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
      }
      setProgress(100);
      setTimeout(() => setBarVisible(false), 650);
      setTimeout(() => setProgress(0), 1200);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sendLoading]);

  const lastMessageIndex = derivedMessages ? derivedMessages.length - 1 : -1;

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
                maxWidth: 600,
                minWidth: 100,
                margin: '0 auto',
                height: 16,
                background: 'rgba(155,255,255,0.07)',
                borderRadius: 10,
                padding: 2,
                boxSizing: 'border-box',
                boxShadow: '0 0 24px #12c7f333',
                overflow: 'hidden',
              }}
            >
              <div
                className={styles.loaderBarLiquidInner}
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  borderRadius: 7,
                  background:
                    'linear-gradient(270deg, #12dbffBB 0%, #22ffb899 70%, #0078f0CC 100%)',
                  boxShadow: '0 0 16px #22cfff88',
                  transition: 'width 0.3s cubic-bezier(.4,1.1,.3,.96)',
                  willChange: 'width',
                  backgroundSize: '200% 100%',
                  animation: 'loader-wave-glass 1.3s infinite linear',
                }}
              ></div>
            </div>
          </div>
          <style>
            {`@keyframes loader-wave-glass {
                  0% { background-position: 0 0; }
                  100% { background-position: 200% 0; }
              }`}
          </style>
        </div>
      )}

      <Flex
        flex={1}
        className={`${styles.chatContainer} ${styles[theme]} ${className}`}
        style={{
          ...style,
          position: isExpanded ? 'fixed' : 'relative',
          top: isExpanded ? 0 : 'auto',
          left: isExpanded ? 0 : 'auto',
          right: isExpanded ? 0 : 'auto',
          bottom: isExpanded ? 0 : 'auto',
          zIndex: isExpanded ? 9999 : 'auto',
          background: isExpanded
            ? theme === 'dark'
              ? '#000'
              : '#fff'
            : 'transparent',
          transition: 'all 0.3s ease',
        }}
        vertical
      >
        {/* Pulsante chiudi quando espanso */}
        {isExpanded && (
          <button
            onClick={() => setIsExpanded(false)}
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              zIndex: 10000,
              background: 'rgba(0,0,0,0.5)',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              width: 40,
              height: 40,
              cursor: 'pointer',
              fontSize: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        )}

        <Flex flex={1} vertical className={styles.messageContainer}>
          <div>
            <Spin spinning={loading}>
              {derivedMessages?.map((message, i) => {
                const isLastMessage = i === lastMessageIndex;
                return (
                  <div key={buildMessageUuidWithRole(message)}>
                    <MessageItem
                      visibleAvatar={true}
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
