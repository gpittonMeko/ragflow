import React, { memo } from 'react';
import { Flex, Spin } from 'antd';

// Componenti e costanti
import MessageItem from '../../components/message-item';
import MessageInput from '../../components/message-input';
import PdfDrawer from '../../components/pdf-drawer';
import { useClickDrawer } from '../../components/pdf-drawer/hooks';
import { MessageType } from '@/constants/chat';

// Hook "generici"
import {
  useFetchNextConversation,
  useGetChatSearchParams,
} from '../../hooks/chat-hooks';
import { useFetchUserInfo } from '../../hooks/user-setting-hooks';

// Utility
import { buildMessageUuidWithRole } from '@/utils/chat';

// Hook e utility "locali" alla chat
import {
  useCreateConversationBeforeUploadDocument,
  useGetFileIcon,
  useGetSendButtonDisabled,
  useSendButtonDisabled,
  useSendNextMessage,
} from '../login/hooks';
import { buildMessageItemReference } from '../login/utils';

// Importa l’hook per conversationId (lo usi solo in conversation mode)
import { useEnsureConversationId } from '@/hooks/login-page-hooks';

// Stili
import styles from './index.less';

// Definisci il tuo agentId (quello fornito)
const AGENT_ID = 'a871ecb2eaba11efb3a10242ac120006'; // Sostituisci con l'ID corretto

// Interfaccia per le props; aggiungiamo una prop opzionale per la modalità agent
interface IProps {
  controller: AbortController;
  agentMode?: boolean;
}

const ChatContainer = ({ controller, agentMode = false }: IProps) => {
  // In conversation mode, assicuriamoci che il conversationId esista
  if (!agentMode) {
    useEnsureConversationId();
  }
  // In agent mode, non serve un conversationId: verrà usato AGENT_ID
  const { conversationId } = useGetChatSearchParams();

  // Se non siamo in agent mode, recupera i dati della conversazione
  const { data: conversation } = !agentMode
    ? useFetchNextConversation()
    : { data: {} };

  // Debug: log della conversazione
  console.log('[DEBUG] conversationId:', conversationId);
  console.log('[DEBUG] conversation:', conversation);

  // Prepara le opzioni per useSendNextMessage: se siamo in agent mode, passa agentId
  const sendOptions = agentMode ? { agentId: AGENT_ID } : {};

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
  } = useSendNextMessage(controller, sendOptions);

  // Debug: log degli stati di invio e dei messaggi derivati
  console.log('[DEBUG] loading:', loading);
  console.log('[DEBUG] sendLoading:', sendLoading);
  console.log('[DEBUG] derivedMessages:', derivedMessages);
  console.log('[DEBUG] input value:', value);

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

  // Se siamo in agent mode, bypassa la richiesta user info e usa dati di default
  const { data: userInfo } = agentMode
    ? { data: { nickname: 'Agent', avatar: undefined } }
    : useFetchUserInfo();

  console.log('[DEBUG] userInfo:', userInfo);

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
                  // Se in agent mode, usiamo dati predefiniti
                  nickname={agentMode ? 'Agent' : userInfo?.nickname}
                  avatar={agentMode ? undefined : userInfo?.avatar}
                  avatarDialog={agentMode ? undefined : conversation?.avatar}
                  reference={buildMessageItemReference(
                    {
                      message: derivedMessages,
                      reference: agentMode ? {} : conversation?.reference,
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
          // In agent mode, non si usa conversationId
          conversationId={agentMode ? '' : conversationId}
          createConversationBeforeUploadDocument={createConversationBeforeUploadDocument}
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
  // Per attivare la modalità agent, passa agentMode=true
  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}>
        <h1 className={styles.movingGradientLogo}>SGAI</h1>
      </header>
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

          {/* Per usare l’agent, attiva agentMode */}
          <div className={styles.chatSection}>
            <MemoizedChatContainer controller={new AbortController()} agentMode={true} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PresentationPage;
