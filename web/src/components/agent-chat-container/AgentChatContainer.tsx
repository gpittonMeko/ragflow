// web/src/components/agent-chat-container/AgentChatContainer.tsx
import React, { useRef } from 'react';
import MessageInput from '@/components/message-input';
import MessageItem from '@/components/message-item';
import PdfDrawer from '@/components/pdf-drawer';
import { Flex, Spin } from 'antd';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';
import { MessageType } from '@/constants/chat';
import { buildMessageItemReference } from '@/pages/chat/utils'; // Correggi il path SE NECESSARIO
import styles from './AgentChatContainer.less'; // Crea AgentChatContainer.less o usa stili esistenti
import { useSendAgentMessage } from '@/hooks/agent-chat-hooks/useSendAgentMessage'; // Path corretto
import { useFetchAgentAvatar } from '@/hooks/agent-chat-hooks/useFetchAgentAvatar'; // Path corretto
import { useSendButtonDisabled } from '@/pages/chat/hooks'; // Path corretto
import { buildMessageUuidWithRole } from '@/utils/chat'; // **IMPORT ADDED - IMPORTANT!**


interface IProps {
    agentId: string; // agentId come prop
}

const AgentChatContainer = ({ agentId }: IProps) => {
    const ref = useRef(null);
    const { visible, hideModal, documentId, selectedChunk, clickDocumentButton } = useClickDrawer();
    console.log("AgentChatContainer: clickDocumentButton prop:", clickDocumentButton); // ADD THIS LOG


    // Usa il nuovo hook useSendAgentMessage, passando agentId
    const {
        value,
        loading,
        sendLoading,
        derivedMessages,
        reference, // ⬅️ AGGIUNGI QUESTO
        handleInputChange,
        handlePressEnter,
        regenerateMessage,
        removeMessageById,
    } = useSendAgentMessage(agentId);
    
    console.log("VERIFICA reference:", reference);


    console.log("Drawer visible:", visible);
    console.log("Document ID:", documentId);
    console.log("Chunk:", selectedChunk);

    const sendDisabled = useSendButtonDisabled(value); // Reutilizza hook per pulsante disabilitato
    // Usa il nuovo hook per l'avatar dell'agente, passando agentId
    const { data: avatarData } = useFetchAgentAvatar(agentId); // agentId è passato all'hook

    if (!agentId) {
        return <div>Agent ID mancante</div>; // Gestisci il caso in cui agentId non è fornito
    }

    return (
        <>
            <Flex flex={1} className={styles.agentChatContainer} vertical>
                <Flex flex={1} vertical className={styles.messageContainer}>
                    <div>
                        <Spin spinning={loading}>
                            {derivedMessages?.map((message, i) => (
                                <MessageItem
                                    key={buildMessageUuidWithRole(message)} // FUNZIONE IMPORTATA ORA DISPONIBILE
                                    item={message}
                                    nickname="You"
                                    avatarDialog={avatarData?.avatar} // Avatar dell'agente
                                    reference={buildMessageItemReference(
                                        { message: derivedMessages, reference }, message
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
                    disabled={false} // Puoi aggiungere logica per disabilitare input se necessario
                    sendDisabled={sendDisabled}
                    onInputChange={handleInputChange}
                    onPressEnter={handlePressEnter}
                    sendLoading={sendLoading}
                    uploadMethod="external_upload_and_parse" // Mantieni o modifica se necessario
                    showUploadIcon={false} // Mantieni o modifica se necessario
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