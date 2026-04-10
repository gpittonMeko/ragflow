import MessageInput from '@/components/message-input';
import MessageItem from '@/components/message-item';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';
import { MessageType, SharedFrom } from '@/constants/chat';
import { useSendButtonDisabled } from '@/pages/chat/hooks';
import { Flex, Spin } from 'antd';
import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import {
  useGetSharedChatSearchParams,
  useSendSharedMessage,
} from '../shared-hooks';
import { buildMessageItemReference } from '../utils';

import PdfDrawer from '@/components/pdf-drawer';
import WhatsAppSupport from '@/components/whatsapp-support';
import { useFetchNextConversationSSE } from '@/hooks/chat-hooks';
import { useFetchFlowSSE } from '@/hooks/flow-hooks';
import i18n from '@/locales/config';
import { buildMessageUuidWithRole } from '@/utils/chat';
import styles from './index.less';

const ChatContainer = ({ theme }) => {
  const {
    sharedId: conversationId,
    from,
    locale,
    visibleAvatar,
  } = useGetSharedChatSearchParams();
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
    hasError,
    stopOutputMessage,
    isGenerating, // <-- AGGIUNGI QUESTO!
  } = useSendSharedMessage();
  const SIMULATED_TOTAL_MS = 180000; // 3 minuti
  const [barWidth, setBarWidth] = useState(370);
  const sendDisabled = useSendButtonDisabled(value);
  const messagesContainerRef = useRef(null);
  const isGeneratingRef = useRef(false);
  const inputRef = useRef(null);
  const inputContainerRef = useRef(null);
  const lastMessageRef = useRef(null);
  const [progress, setProgress] = useState(0); // <-- AGGIUNGI QUESTA RIGA
  const [barVisible, setBarVisible] = useState(false); // <-- E QUESTA
  const [hasMounted, setHasMounted] = useState(false);
  const [hasFocusedOnce, setHasFocusedOnce] = useState(false);

  const [blocked, setBlocked] = useState(false);

  const fetchAvatarHook = useMemo(() => {
    return from === SharedFrom.Agent
      ? useFetchFlowSSE
      : useFetchNextConversationSSE;
  }, [from]);

  React.useEffect(() => {
    if (locale && i18n.language !== locale) {
      i18n.changeLanguage(locale);
    }
  }, [locale, visibleAvatar]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    let interval: any = null;
    const START = Date.now();

    if (sendLoading || isGenerating) {
      /*  stiamo GENERANDO  */
      isGeneratingRef.current = true; // ★ salva stato precedente
      setBarVisible(true);
      setProgress(0);
      window.parent?.postMessage({ type: 'generation-started' }, '*');

      interval = setInterval(() => {
        const elapsed = Date.now() - START;
        const target = Math.min(90, (elapsed / SIMULATED_TOTAL_MS) * 90);
        setProgress(target);
      }, 200);
    } else {
      /*  la generazione è FINITA  */
      if (isGeneratingRef.current) {
        // ★ transizione true → false
        window.parent?.postMessage({ type: 'generation-finished' }, '*');
      }
      isGeneratingRef.current = false; // ★ reset flag

      setProgress(100);
      setTimeout(() => setBarVisible(false), 650);
      setTimeout(() => setProgress(0), 1200);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sendLoading, isGenerating]);

  useEffect(() => {
    function handleParentMsg(e: MessageEvent) {
      if (e.data?.type === 'ragflow-token' && e.data.token) {
        console.log('[IFRAME] Ricevuto token dal parent:', e.data.token);
        localStorage.setItem('Authorization', e.data.token);

        // Triggera un evento custom per notificare che il token è arrivato
        window.dispatchEvent(new CustomEvent('token-ready'));
      }
    }
    window.addEventListener('message', handleParentMsg);

    // NON chiedere subito il token - aspetta che arrivi dal parent

    return () => window.removeEventListener('message', handleParentMsg);
  }, []);

  useEffect(() => {
    const resize = () => {
      if (window.innerWidth < 480) {
        setBarWidth(Math.min(window.innerWidth * 0.85, 260)); // 👈 massimo 260px su mobile
      } else if (window.innerWidth < 768) {
        setBarWidth(300);
      } else {
        setBarWidth(370);
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  //  // Prevenzione focus durante digitazione
  //  useEffect(() => {
  //    const preventAutofocusScroll = (e) => {
  //      if (sendLoading || isGeneratingRef.current) return;
  //      if (inputRef.current && document.activeElement === inputRef.current) {
  //        if (e.type === 'scroll') {
  //          e.preventDefault();
  //          e.stopPropagation();
  //          return false;
  //        }
  //      }
  //    };
  //    document.addEventListener('scroll', preventAutofocusScroll, { passive: false });
  //    return () => {
  //      document.removeEventListener('scroll', preventAutofocusScroll);
  //    };
  //  }, [sendLoading]);

  const { data: avatarData } = fetchAvatarHook(conversationId);

  if (!conversationId) {
    return <div>empty</div>;
  }

  useEffect(() => {
    function handleLimitMsg(e: MessageEvent) {
      if (e.data?.type === 'limit-status') {
        setBlocked(Boolean(e.data.blocked));
      }
    }
    window.addEventListener('message', handleLimitMsg);
    return () => window.removeEventListener('message', handleLimitMsg);
  }, []);

  //
  //useEffect(() => {
  //  const scrollBox = messagesContainerRef.current;
  //  if (!scrollBox) return;
  //
  //  // Solo se sei già in fondo
  //  const isNearBottom = scrollBox.scrollHeight - scrollBox.scrollTop - scrollBox.clientHeight < 40;
  //
  //  if (isNearBottom) {
  //    setTimeout(() => {
  //      scrollBox.scrollTo({
  //        top: scrollBox.scrollHeight,
  //        behavior: 'smooth',
  //      });
  //    }, 230);
  //  }
  //}, [derivedMessages.length]);
  //
  //  // Ultimo messaggio
  const lastMessageIndex = derivedMessages ? derivedMessages.length - 1 : -1;

  return (
    <>
      {barVisible && (
        <div className={styles.loaderBarWrapper}>
          <div className={styles.loaderGlass}>
            <div className={styles.loaderSpinner} />
            <span className={styles.loaderGlassText}>
              {progress < 30
                ? 'Analisi documenti...'
                : progress < 60
                  ? 'Elaborazione risposta...'
                  : progress < 90
                    ? 'Completamento in corso...'
                    : 'Finalizzazione...'}
            </span>
            <div
              className={styles.loaderBarLiquid}
              style={{
                height: 3,
                background: 'var(--border-color)',
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
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
        </div>
      )}

      <Flex
        flex={1}
        className={`${styles.chatContainer} ${styles[theme]}`}
        vertical
      >
        <Flex
          flex={1}
          vertical
          className={styles.messageContainer}
          ref={messagesContainerRef}
        >
          <div>
            <Spin
              spinning={loading || sendLoading}
              tip={loading ? 'Caricamento conversazione...' : undefined}
              size="large"
            >
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
                    ></MessageItem>
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
              margin: '0 16px 8px',
              padding: '8px 16px',
              background: '#fff3cd',
              color: '#664d03',
              border: '1px solid #ffc107',
              borderRadius: 4,
              fontSize: 14,
              fontWeight: 500,
              fontFamily: 'var(--font-sans)',
            }}
          >
            Limite gratuito raggiunto - effettua il login per continuare
          </div>
        )}

        <MessageInput
          isShared
          value={value}
          disabled={blocked}
          sendDisabled={sendDisabled || blocked}
          conversationId={conversationId}
          onInputChange={handleInputChange}
          onPressEnter={handlePressEnter}
          sendLoading={sendLoading}
          uploadMethod="external_upload_and_parse"
          showUploadIcon={false}
          stopOutputMessage={stopOutputMessage}
          autoFocus={false}
        ></MessageInput>
      </Flex>
      {visible && (
        <PdfDrawer
          visible={visible}
          hideModal={hideModal}
          documentId={documentId}
          chunk={selectedChunk}
        ></PdfDrawer>
      )}

      {/* WhatsApp Support Button */}
      <WhatsAppSupport phoneNumber="3288216708" />
    </>
  );
};

export default forwardRef((props, ref) => (
  <ChatContainer {...props} ref={ref} />
));
