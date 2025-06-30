import MessageInput from '@/components/message-input';
import MessageItem from '@/components/message-item';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';
import { MessageType, SharedFrom } from '@/constants/chat';
import { useSendButtonDisabled } from '@/pages/chat/hooks';
import { Flex, Spin } from 'antd';
import React, { forwardRef, useMemo, useRef, useEffect, useState } from 'react';
import {
  useGetSharedChatSearchParams,
  useSendSharedMessage,
} from '../shared-hooks';
import { buildMessageItemReference } from '../utils';

import PdfDrawer from '@/components/pdf-drawer';
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
    isGenerating   // <-- AGGIUNGI QUESTO!

  } = useSendSharedMessage();
  const SIMULATED_TOTAL_MS = 180000; // 3 minuti
  const [barWidth, setBarWidth] = useState(370);
  const sendDisabled = useSendButtonDisabled(value);
  const messagesContainerRef = useRef(null);
  const isGeneratingRef = useRef(false);
  const inputRef = useRef(null);
  const inputContainerRef = useRef(null);
  const lastMessageRef = useRef(null);
  const [progress, setProgress] = useState(0);      // <-- AGGIUNGI QUESTA RIGA
  const [barVisible, setBarVisible] = useState(false); // <-- E QUESTA
  const [hasMounted, setHasMounted] = useState(false);
  const [hasFocusedOnce, setHasFocusedOnce] = useState(false);

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

  useEffect(() => {
  setHasMounted(true);
}, []);

useEffect(() => {
  let interval = null;
  let finished = false;
  const START = Date.now();

  if (sendLoading || isGenerating) {
    setBarVisible(true);
    setProgress(0);

  interval = setInterval(() => {
    const elapsed = Date.now() - START;
    let target = Math.min(90, (elapsed / SIMULATED_TOTAL_MS) * 90);
    setProgress(target);
  }, 200);
  } else {
    setProgress(100);                // Va a 100% a fine generazione
    finished = true;
    setTimeout(() => setBarVisible(false), 650);  // Nascondi con fade-out
    setTimeout(() => setProgress(0), 1200);      // Resetta per dopo
  }

  return () => {
    finished = true;
    if (interval) clearInterval(interval);
  };
}, [sendLoading, isGenerating]);

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
  
  const { data: avatarData } = useFetchAvatar();

  if (!conversationId) {
    return <div>empty</div>;
  }


useEffect(() => {
  const container = messagesContainerRef.current;
  if (!container) return;

  // Scrolla sempre in fondo
  setTimeout(() => {
    container.scrollTop = container.scrollHeight;
    // Invia la nuova height ogni generazione
    window.parent && window.parent.postMessage({
      type: 'iframe-height',
      height: container.scrollHeight,
    }, '*');
  }, 120);
}, [derivedMessages.length, sendLoading, isGenerating]);

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
              <span className={styles.loaderGlassText}>Generazione in corso...</span>
              <div
                className={styles.loaderBarLiquid}
                style={{
                  width: barWidth,
                  height: 16,
                  background: 'rgba(155,255,255,0.07)',
                  borderRadius: 10,
                  padding: 2,
                  boxSizing: 'border-box',
                  boxShadow: '0 0 24px #12c7f333',
                  overflow: 'hidden',
                }}>
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
                    animation: 'loader-wave-glass 1.3s infinite linear'
                  }}>
                </div>
              </div>
            </div>
            {/* CSS animation direttamente qui */}
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

        <MessageInput
          isShared
          value={value}
          disabled={hasError}
          sendDisabled={sendDisabled}
          conversationId={conversationId}
          onInputChange={handleInputChange}
          onPressEnter={handlePressEnter}
          sendLoading={sendLoading}
          uploadMethod="external_upload_and_parse"
          showUploadIcon={false}
          stopOutputMessage={stopOutputMessage}
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
    </>
  );
};

export default forwardRef((props, ref) => <ChatContainer {...props} ref={ref} />);