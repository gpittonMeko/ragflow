import React from 'react';
import { Flex, Spin } from 'antd';
import { MessageType } from '@/constants/chat';
import MessageItem from '@/components/message-item';
import MessageInput from '@/components/message-input';
import PdfDrawer from '@/components/pdf-drawer';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';
import { buildMessageItemReference } from '@/pages/chat/utils';
import { buildMessageUuidWithRole } from '@/utils/chat';
import { useSendNextMessage } from '@/pages/flow/chat/hooks';
import { useGetFileIcon } from '@/pages/chat/hooks';
import { useFetchFlow } from '@/hooks/flow-hooks';
import { useFetchUserInfo } from '@/hooks/user-setting-hooks';
import styles from './AgentChatContainer.less';

interface IProps {
  agentId: string; // Avrai quest’ID in chiaro
}

const AgentChatContainer: React.FC<IProps> = ({ agentId }) => {
  const {
    sendLoading,
    handleInputChange,
    handlePressEnter,
    value,
    loading,
    ref,
    derivedMessages,
    reference,
  } = useSendNextMessage({ agentId }); 
  // Se la tua old version funzionava passandogli `agentId` da solo,
  // potresti farlo, ma la versione attuale dell'hook si aspetta { agentId }.

  // Hook pdf-drawer
  const { visible, hideModal, documentId, selectedChunk, clickDocumentButton } = useClickDrawer();

  useGetFileIcon();
  const { data: userInfo } = useFetchUserInfo();
  const { data: canvasInfo } = useFetchFlow();

  if (!agentId) {
    return <div>Agent ID mancante</div>;
  }

  return (
    <>
      <Flex flex={1} className={styles.agentChatContainer} vertical>
        <Flex flex={1} vertical className={styles.messageContainer}>
          <div>
            <Spin spinning={loading}>
              {derivedMessages?.map((message, i) => {
                const isAssistant = message.role === MessageType.Assistant;
                const isLastAssistant = isAssistant && i === derivedMessages.length - 1;

                return (
                  <MessageItem
                    key={buildMessageUuidWithRole(message)}
                    item={message}
                    nickname={userInfo?.nickname ?? 'You'}
                    avatar={userInfo?.avatar}
                    avatarDialog={canvasInfo?.avatar}
                    reference={buildMessageItemReference(
                      { message: derivedMessages, reference },
                      message
                    )}
                    clickDocumentButton={clickDocumentButton}
                    loading={isAssistant && sendLoading && isLastAssistant}
                    index={i}
                    showLikeButton={false}
                    showLoudspeaker={false}
                    sendLoading={sendLoading}
                  />
                );
              })}
            </Spin>
          </div>
          <div ref={ref} />
        </Flex>

        <MessageInput
          value={value}
          disabled={false}
          sendDisabled={sendLoading}
          onInputChange={handleInputChange}
          onPressEnter={handlePressEnter}
          sendLoading={sendLoading}
          showUploadIcon={false}
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

export default AgentChatContainer;
