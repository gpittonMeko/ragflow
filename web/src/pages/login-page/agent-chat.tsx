import MessageInput from '@/components/message-input';
import MessageItem from '@/components/message-item';
import { MessageType } from '@/constants/chat';
import { useSendAgentMessage } from '@/hooks/agent-chat-hooks/useSendAgentMessage';
import { buildMessageUuidWithRole } from '@/utils/chat';
import { Flex, Spin } from 'antd';
import React from 'react';

interface AgentChatProps {
  agentId: string;
  className?: string;
  style?: React.CSSProperties;
}

const AgentChat: React.FC<AgentChatProps> = ({ agentId, className, style }) => {
  const {
    value,
    ref,
    loading,
    sendLoading,
    derivedMessages,
    handleInputChange,
    handlePressEnter,
    stopOutputMessage,
  } = useSendAgentMessage(agentId);

  // Se l'agent non esiste, mostra un messaggio
  if (!agentId) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
        <p>Agent non configurato. Contatta l'amministratore.</p>
      </div>
    );
  }

  return (
    <Flex flex={1} className={className} style={style} vertical>
      <Flex vertical style={{ flex: '1 1 0%', overflowY: 'auto' }}>
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
                item={message}
                showLikeButton={false}
                sendLoading={sendLoading}
              />
            ))}
          </Spin>
        </div>
        <div ref={ref} />
      </Flex>
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
  );
};

export default AgentChat;
