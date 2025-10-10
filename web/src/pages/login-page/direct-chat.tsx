import MessageInput from '@/components/message-input';
import MessageItem from '@/components/message-item';
import PdfDrawer from '@/components/pdf-drawer';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';
import { useTheme } from '@/components/theme-provider';
import { MessageType } from '@/constants/chat';
import { useFetchFlowSSE } from '@/hooks/flow-hooks';
import { useSendButtonDisabled } from '@/pages/chat/share/shared-hooks';
import { useSendSharedMessage } from '@/pages/chat/shared-hooks';
import { buildMessageItemReference } from '@/pages/chat/utils';
import { buildMessageUuidWithRole } from '@/utils/chat';
import { Flex, Spin } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'umi';
import styles from '../chat/share/index.less';

interface DirectChatProps {
  agentId: string;
  className?: string;
  style?: React.CSSProperties;
}

const DirectChat: React.FC<DirectChatProps> = ({
  agentId,
  className,
  style,
}) => {
  const { theme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  // Imposta i parametri URL necessari per useSendSharedMessage
  useEffect(() => {
    const currentParams = new URLSearchParams(location.search);
    const needsUpdate =
      currentParams.get('shared_id') !== agentId ||
      currentParams.get('from') !== 'agent' ||
      currentParams.get('visible_avatar') !== '1';

    if (needsUpdate) {
      const newParams = new URLSearchParams({
        shared_id: agentId,
        from: 'agent',
        visible_avatar: '1',
      });
      navigate(
        {
          pathname: location.pathname,
          search: `?${newParams.toString()}`,
        },
        { replace: true },
      );
    }
  }, [agentId, location.pathname, location.search, navigate]);

  const {
    handlePressEnter,
    handleInputChange,
    value,
    sendLoading,
    ref,
    loading,
    derivedMessages,
    hasError,
    stopOutputMessage,
  } = useSendSharedMessage();

  const { visible, hideModal, documentId, selectedChunk, clickDocumentButton } =
    useClickDrawer();
  const sendDisabled = useSendButtonDisabled(value);

  const [progress, setProgress] = useState(0);
  const [barVisible, setBarVisible] = useState(false);
  const isGeneratingRef = useRef(false);
  const SIMULATED_TOTAL_MS = 180000; // 3 minuti

  // Fetch avatar data
  const { data: avatarData } = useFetchFlowSSE(agentId);

  // Progress bar logic
  useEffect(() => {
    let interval: any = null;
    const START = Date.now();

    if (sendLoading) {
      isGeneratingRef.current = true;
      setBarVisible(true);
      setProgress(0);

      interval = setInterval(() => {
        const elapsed = Date.now() - START;
        const target = Math.min(90, (elapsed / SIMULATED_TOTAL_MS) * 90);
        setProgress(target);
      }, 200);
    } else {
      if (isGeneratingRef.current) {
        isGeneratingRef.current = false;
      }
      setProgress(100);
      setTimeout(() => setBarVisible(false), 650);
      setTimeout(() => setProgress(0), 1200);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sendLoading]);

  const lastMessageIndex = derivedMessages ? derivedMessages.length - 1 : -1;

  return (
    <>
      {barVisible && (
        <div className={styles.loaderBarWrapper}>
          <div className={styles.loaderGlass}>
            <span className={styles.loaderGlassText}>
              Generazione in corso...
            </span>
            <div
              className={styles.loaderBarLiquid}
              style={{
                width: '100%',
                maxWidth: 600,
                minWidth: 100,
                margin: '0 auto',
                height: 16,
                background: 'rgba(155,255,255,0.07)',
                borderRadius: 10,
                padding: 2,
                boxSizing: 'border-box',
                boxShadow: '0 0 24px #12c7f333',
                overflow: 'hidden',
              }}
            >
              <div
                className={styles.loaderBarLiquidInner}
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  borderRadius: 7,
                  background:
                    'linear-gradient(270deg, #12dbffBB 0%, #22ffb899 70%, #0078f0CC 100%)',
                  boxShadow: '0 0 16px #22cfff88',
                  transition: 'width 0.3s cubic-bezier(.4,1.1,.3,.96)',
                  willChange: 'width',
                  backgroundSize: '200% 100%',
                  animation: 'loader-wave-glass 1.3s infinite linear',
                }}
              ></div>
            </div>
          </div>
          <style>
            {`@keyframes loader-wave-glass {
                  0% { background-position: 0 0; }
                  100% { background-position: 200% 0; }
              }`}
          </style>
        </div>
      )}

      <Flex
        flex={1}
        className={`${styles.chatContainer} ${styles[theme]} ${className}`}
        style={style}
        vertical
      >
        <Flex flex={1} vertical className={styles.messageContainer}>
          <div>
            <Spin spinning={loading}>
              {derivedMessages?.map((message, i) => {
                const isLastMessage = i === lastMessageIndex;
                return (
                  <div key={buildMessageUuidWithRole(message)}>
                    <MessageItem
                      visibleAvatar={true}
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
                        isLastMessage
                      }
                      index={i}
                      clickDocumentButton={clickDocumentButton}
                      showLikeButton={false}
                      showLoudspeaker={false}
                    />
                  </div>
                );
              })}
            </Spin>
          </div>
          <div ref={ref} />
        </Flex>

        <MessageInput
          isShared
          value={value}
          disabled={false}
          sendDisabled={sendDisabled || sendLoading}
          conversationId={agentId}
          onInputChange={handleInputChange}
          onPressEnter={handlePressEnter}
          sendLoading={sendLoading}
          uploadMethod="external_upload_and_parse"
          showUploadIcon={false}
          stopOutputMessage={stopOutputMessage}
          autoFocus={false}
        />
      </Flex>

      {visible && (
        <PdfDrawer
          visible={visible}
          hideModal={hideModal}
          documentId={documentId}
          chunk={selectedChunk}
        />
      )}
    </>
  );
};

export default DirectChat;
