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

  // --------------- PROGRESS BAR SIMULATA ---------------
  // Durata del caricamento simulato (ms)
  const SIMULATED_TOTAL_MS = 180000; // 3 minuti
  const BAR_MAX = 97; // la barra si ferma qui finché l'output non arriva
  const [progress, setProgress] = useState(0);
  const [barVisible, setBarVisible] = useState(false);

  useEffect(() => {
    let interval = null;
    if (sendLoading) {
      setBarVisible(true);
      setProgress(0);
      const startedAt = Date.now();

      interval = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        let pc = Math.min(BAR_MAX, (elapsed / SIMULATED_TOTAL_MS) * 100);
        if (pc >= BAR_MAX - 2) pc = BAR_MAX - Math.random() * 2;
        setProgress(pc);
      }, 300);
    } else {
      // Finale: completa la barra e nascondila dopo poco
      setProgress(100);
      setTimeout(() => setBarVisible(false), 650);
      setTimeout(() => setProgress(0), 1200);
    }
    return () => clearInterval(interval);
  }, [sendLoading]);
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
      {isGenerating && (
      <div className={styles.loaderBarWrapper}>
        <div className={styles.loaderGlass}>
          <span className={styles.loaderGlassText}>
            Generazione in corso...
          </span>
          <div className={styles.loaderBarLiquid} />
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