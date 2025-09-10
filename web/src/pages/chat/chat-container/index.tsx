import MessageItem from '@/components/message-item';
import { MessageType } from '@/constants/chat';
import { Flex, Spin } from 'antd';
import {
  useCreateConversationBeforeUploadDocument,
  useGetFileIcon,
  useGetSendButtonDisabled,
  useSendButtonDisabled,
  useSendNextMessage,
} from '../hooks';
import { buildMessageItemReference } from '../utils';

import MessageInput from '@/components/message-input';
import PdfDrawer from '@/components/pdf-drawer';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';
import {
  useFetchNextConversation,
  useGetChatSearchParams,
} from '@/hooks/chat-hooks';
import { useFetchUserInfo } from '@/hooks/user-setting-hooks';
import { buildMessageUuidWithRole } from '@/utils/chat';
import { memo } from 'react';
import styles from './index.less';

interface IProps {
  controller: AbortController;
}

const ChatContainer = ({ controller }: IProps) => {
  const { conversationId } = useGetChatSearchParams();
  const { data: conversation } = useFetchNextConversation();

  const {
    value,
    ref,
    loading,
    sendLoading,
    derivedMessages,
    handleInputChange,
    handlePressEnter,
    regenerateMessage,
    removeMessageById,
    stopOutputMessage,
  } = useSendNextMessage(controller);

  const { visible, hideModal, documentId, selectedChunk, clickDocumentButton } =
    useClickDrawer();
  const disabled = useGetSendButtonDisabled();
  const sendDisabled = useSendButtonDisabled(value);
  useGetFileIcon();
  const { data: userInfo } = useFetchUserInfo();
  const { createConversationBeforeUploadDocument } =
    useCreateConversationBeforeUploadDocument();

  return (
  <>
    <Flex flex={1} className={styles.chatContainer} vertical>
      {/* Mostra i messaggi solo se esistono */}
      {derivedMessages && derivedMessages.length > 0 && (
        <Flex vertical className={styles.messageContainer}>
          <div>
            <Spin spinning={loading}>
              {derivedMessages.map((message, i) => (
                <MessageItem
                  loading={
                    message.role === MessageType.Assistant &&
                    sendLoading &&
                    derivedMessages.length - 1 === i
                  }
                  key={buildMessageUuidWithRole(message)}
                  nickname={userInfo.nickname}
                  avatar={userInfo.avatar}
                  avatarDialog={canvasInfo.avatar}
                  item={message}
                  reference={buildMessageItemReference(
                    { message: derivedMessages, reference },
                    message,
                  )}
                  clickDocumentButton={clickDocumentButton}
                  index={i}
                  showLikeButton={false}
                  sendLoading={sendLoading}
                />
              ))}
            </Spin>
          </div>
          <div ref={ref} />
        </Flex>
      )}

      {/* Input sempre visibile */}
      <MessageInput
        showUploadIcon={false}
        value={value}
        sendLoading={sendLoading}
        disabled={false}
        sendDisabled={sendLoading}
        conversationId=""
        onPressEnter={handlePressEnter}
        onInputChange={handleInputChange}
        stopOutputMessage={stopOutputMessage}
      />
    </Flex>

    <PdfDrawer
      visible={visible}
      hideModal={hideModal}
      documentId={documentId}
      chunk={selectedChunk}
    />
  </>
);

};

export default memo(ChatContainer);
