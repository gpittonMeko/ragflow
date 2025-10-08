import React, { useRef } from 'react';
import MessageInput from '@/components/message-input';
import MessageItem from '@/components/message-item';
import PdfDrawer from '@/components/pdf-drawer';
import { Flex, Spin } from 'antd';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';
import { MessageType } from '@/constants/chat';
import { buildMessageItemReference } from '@/pages/chat/utils';
import styles from './AgentChatContainer.less';
import { useSendAgentMessage } from '@/hooks/agent-chat-hooks/useSendAgentMessage';
import { useFetchAgentAvatar } from '@/hooks/agent-chat-hooks/useFetchAgentAvatar';
import { useSendButtonDisabled } from '@/pages/chat/hooks';
import { buildMessageUuidWithRole } from '@/utils/chat';


interface IProps {
    agentId: string;
    onFirstGeneration?: () => void;
}

const AgentChatContainer = ({ agentId, onFirstGeneration }: IProps) => {
    const ref = useRef(null);
    const { visible, hideModal, documentId, selectedChunk, clickDocumentButton } = useClickDrawer();

    const {
        value,
        loading,
        sendLoading,
        derivedMessages,
        handleInputChange,
        handlePressEnter,
        regenerateMessage,
        removeMessageById,
    } = useSendAgentMessage(agentId, onFirstGeneration);

    const latestAssistantMessage = derivedMessages.slice(-1).find(msg => msg.role === MessageType.Assistant);
    console.log("latestAssistantMessage:", latestAssistantMessage); // AGGIUNGI QUESTO
    const reference = latestAssistantMessage?.reference; // CORRETTO: reference è direttamente nel messaggio, non in data
    console.log("VERIFICA reference:", reference);
    console.log("reference?.chunks:", reference?.chunks);
    console.log("reference?.doc_aggs:", reference?.doc_aggs);

    const sendDisabled = useSendButtonDisabled(value);
    const { data: avatarData } = useFetchAgentAvatar(agentId);

    if (!agentId) {
        return <div>Agent ID mancante</div>;
    }

    return (
        <>
            <Flex flex={1} className={styles.agentChatContainer} vertical>
                <Flex flex={1} vertical className={styles.messageContainer}>
                    <div>
                        <Spin spinning={loading}>
                            {derivedMessages?.map((message, i) => (
                                <MessageItem
                                    key={buildMessageUuidWithRole(message)}
                                    item={message}
                                    nickname="You"
                                    avatarDialog={avatarData?.avatar}
                                    reference={buildMessageItemReference(
                                        { message: derivedMessages, reference: reference || {} }, message
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
                                    regenerateMessage={regenerateMessage}
                                    removeMessageById={removeMessageById}
                                    sendLoading={sendLoading}
                                ></MessageItem>
                            ))}
                        </Spin>
                    </div>
                    <div ref={ref} />
                </Flex>

                <MessageInput
                    value={value}
                    disabled={false}
                    sendDisabled={sendDisabled}
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

export default AgentChatContainer;