import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Flex, Spin } from 'antd';
import MessageInput from '@/components/message-input';
import MessageItem from '@/components/message-item';
import PdfDrawer from '@/components/pdf-drawer';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';
import { MessageType } from '@/constants/chat';
import { Authorization } from '@/constants/authorization';
import { buildMessageUuidWithRole } from '@/utils/chat';
import styles from './index.less';

// ✅ usa l’hook di Flow (logica OK)
import { useSendNextMessage } from '@/pages/flow/chat/hooks';

// 🔁 usa lo stesso util di Flow (NON quello di share)
import { buildMessageItemReference } from '@/pages/chat/utils';

const ChatContainer = ({ theme }: { theme: string }) => {
  // (facoltativo) si può passare un id, ma come in Flow può rimanere vuoto
  const params = new URLSearchParams(window.location.search);
  const conversationId =
    params.get('sharedId') || params.get('shared_id') || params.get('id') || '';

  const { visible, hideModal, documentId, selectedChunk, clickDocumentButton } =
    useClickDrawer();

  const {
    handlePressEnter,
    handleInputChange,
    value,
    sendLoading,
    loading,
    ref,
    derivedMessages,
    reference,           // ← fornito dall’hook di Flow
    stopOutputMessage,
  } = useSendNextMessage();

  // ⛽ salva il token inviato dal parent
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'ragflow-token' && e.data.token) {
        try {
          localStorage.setItem(Authorization, e.data.token);
          // facoltativo: notifica che ora siamo autenticati
          window.parent?.postMessage({ type: 'shared-token-ack' }, '*');
        } catch {}
      }
      if (e.data?.type === 'ragflow-logout') {
        try { localStorage.removeItem(Authorization); } catch {}
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // barra “generazione in corso…”
  const SIMULATED_TOTAL_MS = 180000;
  const [progress, setProgress] = useState(0);
  const [barVisible, setBarVisible] = useState(false);
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
      setTimeout(() => setBarVisible(false), 650);
      setTimeout(() => setProgress(0), 1200);
    }
    return () => interval && clearInterval(interval);
  }, [sendLoading]);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const lastMessageRef = useRef<HTMLDivElement | null>(null);

  // autoscroll + resize iframe
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

  const lastMessageIndex = derivedMessages ? derivedMessages.length - 1 : -1;
  const sendDisabled = sendLoading || !String(value || '').trim();

  // 🛡️ reference sicuro (evita crash se fosse undefined)
  const safeReference = useMemo(() => reference ?? [], [reference]);

  return (
    <>
      {barVisible && (
        <div className={styles.loaderBarWrapper}>
          <div className={styles.loaderGlass}>
            <span className={styles.loaderGlassText}>Generazione in corso...</span>
            <div className={styles.loaderBarLiquid} style={{
              width: '100%', maxWidth: 600, minWidth: 100, margin: '0 auto',
              height: 16, background: 'rgba(155,255,255,0.07)', borderRadius: 10,
              padding: 2, boxSizing: 'border-box', boxShadow: '0 0 24px #12c7f333',
              overflow: 'hidden',
            }}>
              <div className={styles.loaderBarLiquidInner} style={{
                width: `${progress}%`, height: '100%', borderRadius: 7,
                background: 'linear-gradient(270deg, #12dbffBB 0%, #22ffb899 70%, #0078f0CC 100%)',
                boxShadow: '0 0 16px #22cfff88',
                transition: 'width 0.3s cubic-bezier(.4,1.1,.3,.96)',
                willChange: 'width', backgroundSize: '200% 100%',
                animation: 'loader-wave-glass 1.3s infinite linear',
              }}/>
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
                      visibleAvatar={false}        // niente /oauth/api/me
                      avatarDialog={undefined}
                      item={message}
                      nickname="You"
                      reference={buildMessageItemReference(
                        { message: derivedMessages, reference: safeReference },
                        message,
                      )}
                      loading={
                        message.role === MessageType.Assistant &&
                        sendLoading && isLastMessage
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
          sendDisabled={sendDisabled}
          conversationId={conversationId || ''}
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
