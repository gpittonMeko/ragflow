// web/src/components/agent-chat-container/AgentChatContainer.tsx
import React, { useRef } from 'react';
import { Flex, Spin } from 'antd';

// Se usi i `MessageType` e la costante per i ruoli
import { MessageType } from '@/constants/chat';

// Componenti e util
import MessageItem from '@/components/message-item';
import MessageInput from '@/components/message-input';
import PdfDrawer from '@/components/pdf-drawer';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';
import { buildMessageItemReference } from '@/pages/chat/utils';
import { buildMessageUuidWithRole } from '@/utils/chat';

// Hook “flow” (presente in FlowChatBox) che gestisce i messaggi, reference, ecc.
import { useSendNextMessage } from '@/pages/flow/chat/hooks';

// Altri hook
import { useGetFileIcon } from '@/pages/chat/hooks';
import { useFetchFlow } from '@/hooks/flow-hooks';
import { useFetchUserInfo } from '@/hooks/user-setting-hooks';

// CSS
import styles from './AgentChatContainer.less';

// Se hai un interface per le props, la mantieni
interface IProps {
  agentId: string;
}

/**
 * AgentChatContainer che integra le funzioni base + documenti/PDF
 * simile a FlowChatBox
 */
const AgentChatContainer: React.FC<IProps> = ({ agentId }) => {
  // Hook e logiche “FlowChatBox-like”
  const {
    sendLoading,
    handleInputChange,
    handlePressEnter,
    value,
    loading,
    ref,
    derivedMessages,
    reference,
  } = useSendNextMessage(agentId);
  // ^ Se `useSendNextMessage` non supporta l'agentId, togli quell’argomento oppure
  //   modifica l’hook per farglielo gestire.

  // Hook per i documenti/PDF
  const { visible, hideModal, documentId, selectedChunk, clickDocumentButton } = useClickDrawer();

  // Caricamento icone file (flow) e avatar (canvas/utente)
  useGetFileIcon();
  const { data: userInfo } = useFetchUserInfo();
  const { data: canvasInfo } = useFetchFlow();

  // Se manca l’agentId, per sicurezza mostriamo un avviso
  if (!agentId) {
    return <div>Agent ID mancante</div>;
  }

  return (
    <>
      <Flex flex={1} className={styles.agentChatContainer} vertical>
        {/* Area con i messaggi */}
        <Flex flex={1} vertical className={styles.messageContainer}>
          <div>
            <Spin spinning={loading}>
              {derivedMessages?.map((message, i) => {
                // Ogni messaggio
                const isAssistant = message.role === MessageType.Assistant;
                const isLastAssistant = isAssistant && i === derivedMessages.length - 1;

                return (
                  <MessageItem
                    key={buildMessageUuidWithRole(message)}
                    item={message}
                    // Avatar e nickname
                    nickname={userInfo?.nickname ?? 'You'}
                    avatar={userInfo?.avatar} // avatar utente
                    avatarDialog={canvasInfo?.avatar} // avatar "canvas" (es. agente)
                    // reference e doc
                    reference={buildMessageItemReference(
                      { message: derivedMessages, reference },
                      message
                    )}
                    clickDocumentButton={clickDocumentButton}
                    // Se sta ancora “sendLoading” e sei all’ultimo messaggio assistant
                    loading={isAssistant && sendLoading && isLastAssistant}
                    index={i}
                    // Disabilita like e loudspeaker se non servono
                    showLikeButton={false}
                    showLoudspeaker={false}
                    sendLoading={sendLoading}
                  />
                );
              })}
            </Spin>
          </div>
          {/* Riferimento per scroll all’ultimo messaggio */}
          <div ref={ref} />
        </Flex>

        {/* Input messaggi */}
        <MessageInput
          value={value}
          disabled={false}
          sendDisabled={sendLoading}
          onInputChange={handleInputChange}
          onPressEnter={handlePressEnter}
          sendLoading={sendLoading}
          // Se devi far caricare pdf, come in FlowChatBox potresti mettere showUploadIcon={true}, ecc.
          showUploadIcon={false}
        />
      </Flex>

      {/* Drawer per PDF/documenti */}
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
