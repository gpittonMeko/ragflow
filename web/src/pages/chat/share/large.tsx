import MessageInput from '@/components/message-input';
import MessageItem from '@/components/message-item';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';
import { MessageType, SharedFrom } from '@/constants/chat';
import { useSendButtonDisabled } from '@/pages/chat/hooks';
import { Flex, Spin } from 'antd';
import React, { forwardRef, useMemo } from 'react';
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

const ChatContainer = () => {
  console.log("****[DEBUG - ChatContainer] Render START"); // Debug log all'inizio

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
  console.log("[DEBUG - useSendSharedMessage] Hook chiamato.  Value iniziale:", value, " sendLoading:", sendLoading, " loading:", loading, " hasError:", hasError); // Log all'inizio dell'hook


  const useFetchAvatar = useMemo(() => {
      const fetchHook = from === SharedFrom.Agent ? useFetchFlowSSE : useFetchNextConversationSSE;
      console.log(`[DEBUG - useFetchAvatar] Hook selezionato: ${from === SharedFrom.Agent ? 'useFetchFlowSSE' : 'useFetchNextConversationSSE'}, from prop: ${from}`); // Log quale hook è selezionato
      return fetchHook;
  }, [from]);

  React.useEffect(() => {
      console.log("[DEBUG - useEffect - i18n.changeLanguage] locale:", locale, " current i18n.language:", i18n.language); // Log dentro useEffect per i18n
      if (locale && i18n.language !== locale) {
          i18n.changeLanguage(locale);
      }
  }, [locale, visibleAvatar]);

  const { data: avatarData } = useFetchAvatar();
  console.log("[DEBUG - useFetchAvatar] data: avatarData:", avatarData); // Log dopo la chiamata di useFetchAvatar

  if (!conversationId) {
    return <div>empty</div>;
  }
  console.log("****[DEBUG - ChatContainer] Render END");   // Debug log alla fine

  return (
    <>
      <Flex flex={1} className={styles.chatContainer} vertical>
        <Flex flex={1} vertical className={styles.messageContainer}>
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

export default forwardRef(ChatContainer);
