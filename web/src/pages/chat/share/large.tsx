import MessageInput from '@/components/message-input';
import MessageItem from '@/components/message-item';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';
import { MessageType, SharedFrom } from '@/constants/chat';
import { useSendButtonDisabled } from '@/pages/chat/hooks';
import { Flex, Spin } from 'antd';
import React, { forwardRef, useMemo, useRef, useEffect, useState } from 'react';
import { useGetSharedChatSearchParams } from '../shared-hooks'; // <-- solo per URL params (sharedId/from/locale/visibleAvatar)
import { buildMessageItemReference } from '../utils';

import PdfDrawer from '@/components/pdf-drawer';
import { useFetchNextConversationSSE } from '@/hooks/chat-hooks';
import { useFetchFlowSSE } from '@/hooks/flow-hooks';
import i18n from '@/locales/config';
import { buildMessageUuidWithRole } from '@/utils/chat';
import styles from './index.less';

// 👇 IMPORTA L’HOOK DI FLOW (stessa logica di invio/streaming)
import { useSendNextMessage } from '@/pages/flow/hooks'; // <--- verifica il path esatto nel tuo repo

const ChatContainer = ({ theme }) => {
  const {
    sharedId: conversationId,
    from,
    locale,
    visibleAvatar,
  } = useGetSharedChatSearchParams();

  const { visible, hideModal, documentId, selectedChunk, clickDocumentButton } =
    useClickDrawer();

  // 👇 QUI usiamo lo stesso hook della chat Flow (niente logic-hooks edit)
  const {
    sendLoading,
    handleInputChange,
    handlePressEnter,
    value,
    loading,
    ref,
    derivedMessages,
    reference,           // <— come in Flow
    stopOutputMessage,
  } = useSendNextMessage();

  const sendDisabled = useSendButtonDisabled(value);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const lastMessageRef = useRef<HTMLDivElement | null>(null);

  // Loader “a barra” (UI invariata)
  const SIMULATED_TOTAL_MS = 180000;
  const [progress, setProgress] = useState(0);
  const [barVisible, setBarVisible] = useState(false);

  // Blocco per limiti—resta identico
  const [blocked, setBlocked] = useState(false);

  const useFetchAvatar = useMemo(() => {
    return from === SharedFrom.Agent
      ? useFetchFlowSSE
      : useFetchNextConversationSSE;
  }, [from]);

  React.useEffect(() => {
    if (locale && i18n.language !== locale) {
      i18n.changeLanguage(locale);
    }
  }, [locale, visibleAvatar]);

  // Gestione barra in base a sendLoading (come Flow: una sola fonte-verità)
  useEffect(() => {
    let interval: any = null;
    const START = Date.now();

    if (sendLoading) {
      setBarVisible(true);
      setProgress(0);
      interval = setInterval(() => {
        const elapsed = Date.now() - START;
        const target = Math.min(90, (elapsed / SIMULATED_TOTAL_MS) * 90);
        setProgress(target);
      }, 200);
    } else {
      setProgress(100);
      const t1 = setTimeout(() => setBarVisible(false), 650);
      const t2 = setTimeout(() => setProgress(0), 1200);
      interval = { t1, t2 };
    }

    return () => {
      if (interval?.t1) clearTimeout(interval.t1);
      if (interval?.t2) clearTimeout(interval.t2);
      if (interval && typeof interval === 'number') clearInterval(interval);
    };
  }, [sendLoading]);

  const { data: avatarData } = useFetchAvatar();

  if (!conversationId) {
    return <div>empty</div>;
  }

  // Scroll + resize postMessage verso il parent (come prima)
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    setTimeout(() => {
      container.scrollTop = container.scrollHeight;
      window.parent?.postMessage(
        { type: 'iframe-height', height: container.scrollHeight },
        '*',
      );
    }, 120);
  }, [derivedMessages.length, sendLoading]);

  // riceve dallo shell parent il “limit-status”
  useEffect(() => {
    function handleLimitMsg(e: MessageEvent) {
      if (e.data?.type === 'limit-status') {
        setBlocked(Boolean(e.data.blocked));
      }
    }
    window.addEventListener('message', handleLimitMsg);
    return () => window.removeEventListener('message', handleLimitMsg);
  }, []);

  const lastMessageIndex = derivedMessages ? derivedMessages.length - 1 : -1;

  return (
    <>
      {barVisible && (
        <div className={styles.loaderBarWrapper}>
          <div className={styles.loaderGlass}>
            <span className={styles.loaderGlassText}>Generazione in corso...</span>
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
              />
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

      <Flex flex={1} className={`${styles.chatContainer} ${styles[theme]}`} vertical>
        <Flex
          flex={1}
          vertical
          className={styles.messageContainer}
          ref={messagesContainerRef}
        >
          <div>
            <Spin spinning={loading}>
              {derivedMessages?.map((message, i) => {
                const isLastMessage = i === lastMessageIndex;
                return (
                  <div
                    ref={isLastMessage ? lastMessageRef : null}
                    key={buildMessageUuidWithRole(message)}
                  >
                    <MessageItem
                      visibleAvatar={visibleAvatar}
                      avatarDialog={avatarData?.avatar}
                      item={message}
                      nickname="You"
                      reference={buildMessageItemReference(
                        {
                          // 👇 come in Flow: passa “reference” del hook
                          message: derivedMessages,
                          reference,
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
                      // opzionale: se il tuo MessageItem lo supporta, passa anche sendLoading
                      sendLoading={sendLoading}
                    />
                  </div>
                );
              })}
            </Spin>
          </div>
          <div ref={ref} />
        </Flex>

        {blocked && (
          <div
            style={{
              margin: '0 0 8px',
              padding: '6px 12px',
              background: '#fff3cd',
              color: '#664d03',
              border: '1px solid #ffecb5',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Limite gratuito raggiunto - effettua il login per continuare
          </div>
        )}

        <MessageInput
          isShared
          value={value}
          disabled={false /* come Flow: niente hasError qui */}
          sendDisabled={sendDisabled || blocked}
          conversationId={conversationId /* viene da query param */}
          onInputChange={handleInputChange}
          onPressEnter={handlePressEnter}
          sendLoading={sendLoading}
          uploadMethod="external_upload_and_parse"
          showUploadIcon={false}
          stopOutputMessage={stopOutputMessage}
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

export default forwardRef((props, ref) => <ChatContainer {...props} ref={ref} />);
