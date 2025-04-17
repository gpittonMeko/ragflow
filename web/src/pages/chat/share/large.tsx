import MessageInput from '@/components/message-input';
import MessageItem from '@/components/message-item';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';
import { MessageType, SharedFrom } from '@/constants/chat';
import { useSendButtonDisabled } from '@/pages/chat/hooks';
import { Flex, Spin } from 'antd';
import React, { forwardRef, useMemo, useRef, useEffect } from 'react';
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
  } = useSendSharedMessage();
  const sendDisabled = useSendButtonDisabled(value);
  const messagesContainerRef = useRef(null);
  const isGeneratingRef = useRef(false);
  const inputRef = useRef(null);

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
  
  // Gestione focus e scroll
  useEffect(() => {
    if (!messagesContainerRef.current) return;

    // Gestione inizio e fine generazione
    if (!isGeneratingRef.current && sendLoading) {
      // Inizio generazione
      isGeneratingRef.current = true;
      
      // Notifica al parent di espandere l'iframe
      try {
        window.parent.postMessage({
          type: 'expand-iframe',
          expanding: true
        }, '*');
      } catch (e) {
        console.warn("Errore nell'invio del messaggio al parent", e);
      }
      
      // Scroll iniziale
      if (ref.current) {
        ref.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    } 
    else if (isGeneratingRef.current && !sendLoading) {
      // Fine generazione
      isGeneratingRef.current = false;
      
      // Scroll finale
      setTimeout(() => {
        if (ref.current) {
          ref.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
        
        // Notifica al parent che la generazione è terminata
        try {
          window.parent.postMessage({
            type: 'expand-iframe',
            expanding: false
          }, '*');
        } catch (e) {
          console.warn("Errore nell'invio del messaggio al parent", e);
        }
      }, 300);
    }
  }, [sendLoading, derivedMessages, ref]);
  
  // Prevenzione focus durante digitazione
  useEffect(() => {
    // Impedisce il focus automatico e lo scrolling durante la digitazione
    const preventAutofocusScroll = (e) => {
      if (sendLoading) return; // Permetti lo scrolling durante la generazione
      
      if (inputRef.current && document.activeElement === inputRef.current) {
        // Impedisci focus durante digitazione
        inputRef.current.blur();
        
        // Impedisci scrolling durante digitazione
        if (e.type === 'scroll') {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
    };
    
    // Aggiungi multipli eventi per massima compatibilità
    document.addEventListener('scroll', preventAutofocusScroll, { passive: false });
    document.addEventListener('focus', preventAutofocusScroll, true);
    window.addEventListener('scroll', preventAutofocusScroll, { passive: false });
    
    return () => {
      document.removeEventListener('scroll', preventAutofocusScroll);
      document.removeEventListener('focus', preventAutofocusScroll);
      window.removeEventListener('scroll', preventAutofocusScroll);
    };
  }, [sendLoading]);
  
  const { data: avatarData } = useFetchAvatar();

  if (!conversationId) {
    return <div>empty</div>;
  }

  return (
    <>
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
                return (
                  <MessageItem
                    visibleAvatar={visibleAvatar}
                    key={buildMessageUuidWithRole(message)}
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
                      derivedMessages?.length - 1 === i
                    }
                    index={i}
                    clickDocumentButton={clickDocumentButton}
                    showLikeButton={false}
                    showLoudspeaker={false}
                  ></MessageItem>
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
          ref={inputRef}
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