import MessageInput from '@/components/message-input';
import MessageItem from '@/components/message-item';
import { MessageType } from '@/constants/chat';
import { useSendAgentMessage } from '@/hooks/agent-chat-hooks/useSendAgentMessage';
import { Flex, Spin } from 'antd';
import { memo } from 'react';

interface SimpleAgentChatProps {
  agentId: string;
  className?: string;
  style?: React.CSSProperties;
}

const SimpleAgentChat = ({
  agentId,
  className,
  style,
}: SimpleAgentChatProps) => {
  const {
    value,
    loading,
    sendLoading,
    derivedMessages,
    handleInputChange,
    handlePressEnter,
    removeMessageById,
  } = useSendAgentMessage(agentId);

  return (
    <Flex flex={1} vertical style={style} className={className}>
      <Flex flex={1} vertical style={{ overflow: 'auto', padding: '10px' }}>
        <div>
          <Spin spinning={loading}>
            {derivedMessages?.map((message, i) => (
              <MessageItem
                loading={
                  message.role === MessageType.Assistant &&
                  sendLoading &&
                  derivedMessages.length - 1 === i
                }
                key={message.id}
                nickname={'User'}
                avatar={''}
                avatarDialog={''}
                item={message}
                reference={message.reference || { chunks: [], doc_aggs: [] }}
                clickDocumentButton={() => {}}
                index={i}
                showLikeButton={false}
                sendLoading={sendLoading}
              />
            ))}
          </Spin>
        </div>
      </Flex>
      <MessageInput
        showUploadIcon={false}
        value={value}
        sendLoading={sendLoading}
        disabled={false}
        sendDisabled={sendLoading || !value.trim()}
        conversationId=""
        onPressEnter={handlePressEnter}
        onInputChange={handleInputChange}
        stopOutputMessage={() => {}}
      />
    </Flex>
  );
};

export default memo(SimpleAgentChat);
