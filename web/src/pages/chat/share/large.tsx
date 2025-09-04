// File: src/pages/chat/share/large.tsx
import MessageInput from '@/components/message-input';
import MessageItem from '@/components/message-item';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';
import { MessageType } from '@/constants/chat';
import { Authorization } from '@/constants/authorization';
import { Flex, Spin } from 'antd';
import React, { forwardRef, useEffect, useRef, useState } from 'react';

import PdfDrawer from '@/components/pdf-drawer';
import { buildMessageItemReference } from '../utils';
import { buildMessageUuidWithRole } from '@/utils/chat';
import styles from './index.less';

// ✅ usa l’hook di Flow (quello che funziona)
import { useSendNextMessage } from '@/pages/flow/chat/hooks';

// ——— helper: reference sempre con la shape attesa ———
const normalizeReference = (r: any) => {
  if (r && typeof r === 'object' && !Array.isArray(r)) {
    return {
      ...r,
      doc_aggs: Array.isArray(r.doc_aggs) ? r.doc_aggs : [],
      chunks: Array.isArray(r.chunks) ? r.chunks : [],
    };
  }
  return { doc_aggs: [], chunks: [] };
};

const ChatContainer = ({ theme }) => {
  // --- leggiamo i parametri minimi dall’URL, senza usare shared-hooks ---
  const params = new URLSearchParams(window.location.search);
  const conversationId =
    params.get('sharedId') ||
    params.get('shared_id') ||
    params.get('id') ||
    ''; // opzionale, come in Flow puoi lasciarlo vuoto

  const { visible, hideModal, documentId, selectedChunk, clickDocumentButton } =
    useClickDrawer();

  // ✅ hook di Flow: stessa logica di stream e stato
  const {
    handlePressEnter,
    handleInputChange,
    value,
    sendLoading,
    loading,
    ref,
    derivedMessages,
    reference,            // <— lo fornisce Flow
    stopOutputMessage,
  } = useSendNextMessage();

  // —— token handshake con il parent (usa Authorization come nel resto dell’app) ——
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'ragflow-token' && typeof e.data.token === 'string') {
        try {
          localStorage.setItem(Authorization, e.data.token);
          // opzionale: forza un tick per assicurare che le fetch successive lo leggano
          // location.reload(); // se vuoi proprio forzare, altrimenti non serve
        } catch {}
      }
    };
    window.addEventListener('message', onMsg);

    // se non ho token, chiedo al parent di inviarmelo
    try {
      const hasToken = !!localStorage.getItem(Authorization);
      if (!hasToken) {
        window.parent?.postMessage({ type: 'shared-needs-token' }, '*');
      }
    } catch {}

    return () => window.removeEventListener('message', onMsg);
  }, []);

  const safeReference = normalizeReference(reference);

  // Barra “generazione in corso” (stessa UI, guidata da sendLoading)
  const SIMULATED_TOTAL_MS = 180000; // 3 minuti
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const lastMessageRef = useRef<HTMLDivElement | null>(null);
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

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sendLoading]);

  // autoscroll e resize iframe
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

  // Disabilita invio quando sta generando o input vuoto
  const sendDisabled = sendLoading || !String(value || '').trim();

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
                      // niente avatar/userinfo per evitare 401 su /oauth/api/me
                      visibleAvatar={false}
                      avatarDialog={undefined}
                      item={message}
                      nickname="You"
                      reference={buildMessageItemReference(
                        {
                          message: derivedMessages,
                          reference: safeReference, // <-- shape sempre corretta
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
          sendDisabled={sendDisabled}
          conversationId={conversationId || ''}  // come in Flow puoi usare anche ""
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
