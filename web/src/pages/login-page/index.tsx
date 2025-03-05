import React, { memo } from 'react';
import { Flex, Spin } from 'antd';

// ATTENZIONE AI LIVELLI DI ../
// Da "login-page" dobbiamo risalire di 2 livelli per tornare a "src/",
// quindi: ../../hooks e ../../utils

import MessageItem from '../../components/message-item';
import { MessageType } from '../../constants/chat';
import MessageInput from '../../components/message-input';
import PdfDrawer from '../../components/pdf-drawer';
import { useClickDrawer } from '../../components/pdf-drawer/hooks';

import {
  useFetchNextConversation,
  useGetChatSearchParams,
} from '../../hooks/chat-hooks';
import { useFetchUserInfo } from '../../hooks/user-setting-hooks';
import { buildMessageUuidWithRole } from '../../utils/chat';

// Qui importiamo i moduli (hook e utils) che prima erano "../hooks" e "../utils"
import {
  useCreateConversationBeforeUploadDocument,
  useGetFileIcon,
  useGetSendButtonDisabled,
  useSendButtonDisabled,
  useSendNextMessage,
} from '../../hooks'; // Se i tuoi custom hook sono esportati in un unico index.ts
// oppure: from '../../hooks/chat-hooks' se si trovano lì

import { buildMessageItemReference } from '../../utils'; // Se la funzione si trova in "src/utils/index.ts"
// oppure: from '../../utils/chat' se si trova in "src/utils/chat.ts"

import styles from './index.less';

// Interfaccia per le props di ChatContainer
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
  } = useSendNextMessage(controller);

  const {
    visible,
    hideModal,
    documentId,
    selectedChunk,
    clickDocumentButton,
  } = useClickDrawer();

  const disabled = useGetSendButtonDisabled();
  const sendDisabled = useSendButtonDisabled(value);

  useGetFileIcon();

  const { data: userInfo } = useFetchUserInfo();
  const { createConversationBeforeUploadDocument } =
    useCreateConversationBeforeUploadDocument();

  return (
    <>
      <Flex flex={1} className={styles.chatContainer} vertical>
        <Flex flex={1} vertical className={styles.messageContainer}>
          <div>
            <Spin spinning={loading}>
              {derivedMessages?.map((message, i) => (
                <MessageItem
                  loading={
                    message.role === MessageType.Assistant &&
                    sendLoading &&
                    derivedMessages.length - 1 === i
                  }
                  key={buildMessageUuidWithRole(message)}
                  item={message}
                  nickname={userInfo?.nickname}
                  avatar={userInfo?.avatar}
                  avatarDialog={conversation?.avatar}
                  reference={buildMessageItemReference(
                    {
                      message: derivedMessages,
                      reference: conversation?.reference,
                    },
                    message,
                  )}
                  clickDocumentButton={clickDocumentButton}
                  index={i}
                  removeMessageById={removeMessageById}
                  regenerateMessage={regenerateMessage}
                  sendLoading={sendLoading}
                />
              ))}
            </Spin>
          </div>
          <div ref={ref} />
        </Flex>

        <MessageInput
          disabled={disabled}
          sendDisabled={sendDisabled}
          sendLoading={sendLoading}
          value={value}
          onInputChange={handleInputChange}
          onPressEnter={handlePressEnter}
          conversationId={conversationId}
          createConversationBeforeUploadDocument={
            createConversationBeforeUploadDocument
          }
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

const MemoizedChatContainer = memo(ChatContainer);

const PresentationPage: React.FC = () => {
  return (
    <div className={styles.pageContainer}>
      {/* Header */}
      <header className={styles.header}>
        <h1 className={styles.movingGradientLogo}>SGAI</h1>
      </header>

      {/* Contenuto principale */}
      <div className={styles.mainContent}>
        <div className={styles.presentationContainer}>
          <header className={styles.presentationHeader}>
            <h2 className={styles.presentationTitle}>
              Sommarizzazione Accertamenti - SGAI
            </h2>
          </header>
          <div className={styles.presentation}>
            <p>
              SGAI (Sistema di Gestione e Analisi Intelligente) è una piattaforma che utilizza
              l’intelligenza artificiale per supportare l’analisi e la gestione delle controversie
              tributarie. Lavoriamo in modo indipendente, senza legami con enti istituzionali, per
              garantire trasparenza e imparzialità.
            </p>
            <p>
              <strong>
                SGAI è l'assistente legale che avresti sempre desiderato, ma che non hai mai trovato tra gli umani.
              </strong>
            </p>
          </div>

          {/* Integrazione della chat */}
          <div className={styles.chatSection}>
            <MemoizedChatContainer controller={new AbortController()} />
          </div>
        </div>
      </div>


    </div>
  );
};

export default PresentationPage;
