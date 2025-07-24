import { ReactComponent as AssistantIcon } from '@/assets/svg/assistant.svg';
import { MessageType } from '@/constants/chat';
import { useSetModalState } from '@/hooks/common-hooks';
import { IReference, IReferenceChunk } from '@/interfaces/database/chat';
import classNames from 'classnames';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import {
  useFetchDocumentInfosByIds,
  useFetchDocumentThumbnailsByIds,
} from '@/hooks/document-hooks';
import { IRegenerateMessage, IRemoveMessageById } from '@/hooks/logic-hooks';
import { IMessage } from '@/pages/chat/interface';
import MarkdownContent from '@/pages/chat/markdown-content';
import { getExtension, isImage } from '@/utils/document-util';
import { Avatar, Button, Flex, List, Space, Typography, Collapse, Tooltip } from 'antd';
import { CopyOutlined, DownloadOutlined, EyeOutlined, LinkOutlined } from '@ant-design/icons';
import FileIcon from '../file-icon';
import IndentedTreeModal from '../indented-tree/modal';
import NewDocumentLink from '../new-document-link';
import { useTheme } from '../theme-provider';
import { AssistantGroupButton, UserGroupButton } from './group-button';
import styles from './index.less';

// --- NEW: import del componente nella stessa cartella
import SourceList from './source-list';

const { Text } = Typography;
const { Panel } = Collapse;

interface IProps extends Partial<IRemoveMessageById>, IRegenerateMessage {
  item: IMessage;
  reference: IReference;
  loading?: boolean;
  sendLoading?: boolean;
  visibleAvatar?: boolean;
  nickname?: string;
  avatar?: string;
  avatarDialog?: string | null;
  clickDocumentButton?: (documentId: string, chunk: IReferenceChunk) => void;
  index: number;
  showLikeButton?: boolean;
  showLoudspeaker?: boolean;
}

const MessageItem = ({
  item,
  reference,
  loading = false,
  avatar,
  avatarDialog,
  sendLoading = false,
  clickDocumentButton,
  index,
  removeMessageById,
  regenerateMessage,
  showLikeButton = true,
  showLoudspeaker = true,
  visibleAvatar = true,
}: IProps) => {
  const { theme } = useTheme();
  const isAssistant = item.role === MessageType.Assistant;
  const isUser = item.role === MessageType.User;
  const { data: documentList, setDocumentIds } = useFetchDocumentInfosByIds();
  const { data: documentThumbnails, setDocumentIds: setIds } =
    useFetchDocumentThumbnailsByIds();
  const { visible, hideModal, showModal } = useSetModalState();
  const [clickedDocumentId, setClickedDocumentId] = useState('');
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // --- NEW: riferimento ai chunks per aprire il punto esatto nel PDF
  const referenceChunks = useMemo(() => reference?.chunks ?? [], [reference?.chunks]);

  // --- NEW: rimuovo la legenda "Fonti" duplicata dal testo
  const cleanedContent = useMemo(() => stripLegendFromContent(item.content), [item.content]);

  // Imposta la dimensione corretta per avatar basata su dimensione schermo
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Calcola la dimensione avatar in base alla larghezza della finestra
  const getAvatarSize = () => {
    if (windowWidth <= 480) return 28;
    if (windowWidth <= 768) return 32;
    return 40;
  };

  const avatarSize = getAvatarSize();

  // Documenti citati dal modello (doc_aggs)
  // Rimuovo eventuali duplicati (alcuni backend aggiungono doc con stesso id).
  const referenceDocumentList = useMemo(() => {
    const docs = reference?.doc_aggs ?? [];
    const seen = new Set<string>();
    return docs.filter((d) => {
      const key = d.doc_id || d.url || d.doc_name;
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [reference?.doc_aggs]);

  const handleUserDocumentClick = useCallback(
    (id: string) => () => {
      setClickedDocumentId(id);
      showModal();
    },
    [showModal],
  );

  const handleRegenerateMessage = useCallback(() => {
    regenerateMessage?.(item);
  }, [regenerateMessage, item]);

  useEffect(() => {
    const ids = item?.doc_ids ?? [];
    if (ids.length) {
      setDocumentIds(ids);
      const documentIds = ids.filter((x) => !(x in documentThumbnails));
      if (documentIds.length) {
        setIds(documentIds);
      }
    }
  }, [item.doc_ids, setDocumentIds, setIds, documentThumbnails]);

  // Determine message style based on theme and role
  const getMessageStyle = () => {
    if (isAssistant) {
      // For assistant messages, we want to check if it's dark theme
      return theme === 'dark' ? styles.messageTextDark : styles.messageText;
    } else {
      // For user messages, always use the messageUserText style (which is now theme-aware)
      return styles.messageUserText;
    }
  };

  // --- NEW: click su fonte => apre drawer e highlight
  const onSourceClick = useCallback(
    (idx: number) => {
      const marker = `##${idx + 1}$$`;
      const chunk = referenceChunks?.[idx];

      // 1) Apri PDF drawer, se disponibile
      if (clickDocumentButton && chunk?.doc_id) {
        clickDocumentButton(chunk.doc_id, chunk as IReferenceChunk);
      }

      // 2) Highlight nel contenuto testo (opzionale)
      const el = document.querySelector(`[data-marker="${marker}"]`);
      if (el && 'scrollIntoView' in el) {
        (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add(styles.markerHighlight);
        setTimeout(() => el.classList.remove(styles.markerHighlight), 1500);
      }
    },
    [referenceChunks, clickDocumentButton],
  );

  // --- NEW: copia marker
  const onCopyMarker = useCallback((marker: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(marker).catch(() => {});
    } else {
      const ta = document.createElement('textarea');
      ta.value = marker;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }, []);

  return (
    <div
      className={classNames(styles.messageItem, {
        [styles.messageItemLeft]: item.role === MessageType.Assistant,
        [styles.messageItemRight]: item.role === MessageType.User,
      })}
    >
      <section
        className={classNames(styles.messageItemSection, {
          [styles.messageItemSectionLeft]: item.role === MessageType.Assistant,
          [styles.messageItemSectionRight]: item.role === MessageType.User,
        })}
      >
        <div
          className={classNames(styles.messageItemContent, {
            [styles.messageItemContentReverse]: item.role === MessageType.User,
          })}
        >
          {visibleAvatar &&
            (item.role === MessageType.User ? (
              <Avatar
                size={avatarSize}
                src={avatar ?? '/logo.svg'}
                style={{ minWidth: `${avatarSize}px` }}
              />
            ) : avatarDialog ? (
              <Avatar
                size={avatarSize}
                src={avatarDialog}
                style={{ minWidth: `${avatarSize}px` }}
              />
            ) : (
              <div
                style={{
                  width: `${avatarSize}px`,
                  height: `${avatarSize}px`,
                  minWidth: `${avatarSize}px`,
                }}
              >
                <AssistantIcon style={{ width: '100%', height: '100%' }} />
              </div>
            ))}

          <Flex vertical gap={8} flex={1}>
            <Space>
              {isAssistant ? (
                index !== 0 && (
                  <AssistantGroupButton
                    messageId={item.id}
                    content={item.content}
                    prompt={item.prompt}
                    showLikeButton={showLikeButton}
                    audioBinary={item.audio_binary}
                    showLoudspeaker={showLoudspeaker}
                  ></AssistantGroupButton>
                )
              ) : (
                <UserGroupButton
                  content={item.content}
                  messageId={item.id}
                  removeMessageById={removeMessageById}
                  regenerateMessage={
                    regenerateMessage && handleRegenerateMessage
                  }
                  sendLoading={sendLoading}
                ></UserGroupButton>
              )}

              {/* <b>{isAssistant ? '' : nickname}</b> */}
            </Space>

            <div className={getMessageStyle()}>
              <MarkdownContent
                loading={loading}
                content={cleanedContent} 
                reference={reference}
                clickDocumentButton={clickDocumentButton}
              ></MarkdownContent>
            </div>

            {/* FONTI: UI migliorata, collapse, pulsanti, senza duplicato */}
            {isAssistant && referenceDocumentList.length > 0 && (
              <div className={styles.sourcesWrapper}>
                <Collapse
                  bordered={false}
                  defaultActiveKey={['sources']}
                  expandIconPosition="end"
                  className={styles.sourcesCollapse}
                >
                  <Panel
                    header={
                      <Flex align="center" gap={6}>
                        <Text strong style={{ fontSize: 13 }}>Fonti ({referenceDocumentList.length})</Text>
                      </Flex>
                    }
                    key="sources"
                  >
                    <SourceList
                      docs={referenceDocumentList}
                      onSourceClick={onSourceClick}
                      onCopyMarker={onCopyMarker}
                    />
                  </Panel>
                </Collapse>
              </div>
            )}

            {isUser && documentList.length > 0 && (
              <List
                bordered
                dataSource={documentList}
                renderItem={(item) => {
                  const fileExtension = getExtension(item.name);
                  return (
                    <List.Item>
                      <Flex gap={'small'} align="center">
                        <FileIcon id={item.id} name={item.name}></FileIcon>

                        {isImage(fileExtension) ? (
                          <NewDocumentLink
                            documentId={item.id}
                            documentName={item.name}
                            prefix="document"
                          >
                            {item.name}
                          </NewDocumentLink>
                        ) : (
                          <Button
                            type={'text'}
                            onClick={handleUserDocumentClick(item.id)}
                          >
                            <Text
                              style={{ maxWidth: '40vw' }}
                              ellipsis={{ tooltip: item.name }}
                            >
                              {item.name}
                            </Text>
                          </Button>
                        )}
                      </Flex>
                    </List.Item>
                  );
                }}
              />
            )}
          </Flex>
        </div>
      </section>
      {visible && (
        <IndentedTreeModal
          visible={visible}
          hideModal={hideModal}
          documentId={clickedDocumentId}
        ></IndentedTreeModal>
      )}
    </div>
  );
};

export default memo(MessageItem);

// --- NEW: rimuove la legenda “Fonti” duplicata dal testo (se presente)
function stripLegendFromContent(content: string): string {
  if (!content) return content;
  // cerca blocchi alla fine tipo "**Fonti:**" o "Fonti:" + elenco
  const regex = /\n{0,2}\*\*?Fonti:?[\s\S]*$/i;
  return content.replace(regex, '');
}
