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
  const sendDisabled = useSendButtonDisabled(value);
  const messagesContainerRef = useRef(null);
  const isGeneratingRef = useRef(false);
  const inputRef = useRef(null);
  const inputContainerRef = useRef(null);
  const lastMessageRef = useRef(null);

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

  // --------------- PROGRESS BAR SIMULATA CON EASING ---------------
// Durata simulata fino al 90%
const SIMULATED_TOTAL_MS = 180000; // 3 minuti
const BAR_INF_START = 90; // % dopo cui va "all'infinito"
const BAR_INF_SPEED = 0.09; // %/tick (più basso = più lenta)
const BAR_WIDTH_LG = 370; // px, puoi cambiare la larghezza

const [progress, setProgress] = useState(0);
const [barVisible, setBarVisible] = useState(false);
const fakeStartRef = useRef(null);
useEffect(() => {
  let animationFrame = null;

  function easeInOutQuad(x) {
    return x < 0.5
      ? 2 * x * x
      : 1 - Math.pow(-2 * x + 2, 2) / 2;
  }

  function updateProgress() {
    const now = Date.now();
    let elapsed = now - fakeStartRef.current;
    let perc = (elapsed / SIMULATED_TOTAL_MS);
    let eased = easeInOutQuad(Math.min(1, perc));
    let prog = eased * 100;

    if (prog < BAR_INF_START) {
      setProgress(prog);
      animationFrame = requestAnimationFrame(updateProgress);
    } else {
      setProgress(prev => {
        let nxt = prev + BAR_INF_SPEED;
        if (nxt > 99.7) nxt = 99.7 - Math.random()*0.05;
        animationFrame = requestAnimationFrame(updateProgress);
        return nxt;
      });
    }
  }

  if (sendLoading || isGenerating) {
    setBarVisible(true);
    setProgress(0);
    fakeStartRef.current = Date.now(); // imposta il riferimento SOLO QUI!
    animationFrame = requestAnimationFrame(updateProgress);
  } else {
    setProgress((prev) => (prev > 97 ? prev : 100));
    setTimeout(() => setProgress(100), 20);
    setTimeout(() => setBarVisible(false), 650);
    setTimeout(() => setProgress(0), 1200);
  }

  return () => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
  };
}, [sendLoading, isGenerating]);
// -----------------------------------------------------

  // Gestione focus e scroll
  useEffect(() => {
    if (!messagesContainerRef.current) return;

    // Gestione inizio e fine generazione
    if (!isGeneratingRef.current && sendLoading) {
      isGeneratingRef.current = true;

      try {
        window.parent.postMessage({
          type: 'expand-iframe',
          expanding: true
        }, '*');
      } catch (e) {
        console.warn("Errore nell'invio del messaggio al parent", e);
      }

      if (ref.current) {
        ref.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    } 
    else if (isGeneratingRef.current && !sendLoading) {
      isGeneratingRef.current = false;

      setTimeout(() => {
        try {
          window.parent.postMessage({
            type: 'expand-iframe',
            expanding: false
          }, '*');
        } catch (e) {
          console.warn("Errore nell'invio del messaggio al parent", e);
        }

        setTimeout(() => {
          if (inputRef.current) {
            try {
              inputRef.current.focus();
              if (inputContainerRef.current) {
                inputContainerRef.current.scrollIntoView({ 
                  behavior: 'smooth', 
                  block: 'center'
                });
              }
            } catch (error) {
              console.warn('Errore durante il focus/scroll:', error);
            }
          }
        }, 200);
      }, 300);
    }
  }, [sendLoading, derivedMessages, ref]);

  // Prevenzione focus durante digitazione
  useEffect(() => {
    const preventAutofocusScroll = (e) => {
      if (sendLoading || isGeneratingRef.current) return;
      if (inputRef.current && document.activeElement === inputRef.current) {
        if (e.type === 'scroll') {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
    };
    document.addEventListener('scroll', preventAutofocusScroll, { passive: false });
    return () => {
      document.removeEventListener('scroll', preventAutofocusScroll);
    };
  }, [sendLoading]);
  
  const { data: avatarData } = useFetchAvatar();

  if (!conversationId) {
    return <div>empty</div>;
  }

  // Ultimo messaggio
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
              width: BAR_WIDTH_LG,
              height: 16,
              // barra esterna per larghezza
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
                transition: progress === 100
                  ? 'width 0.42s cubic-bezier(.2,.9,.65,1.02)'
                  : 'width 0.85s cubic-bezier(.48,.06,.23,.99)', // EASING in+out
                // e se vuoi un piccolo effetto move, opzionale:
                willChange: 'width'
              }}
            />
          </div>
        </div>
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