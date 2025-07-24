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
import { Avatar, Button, Flex, List, Space, Typography, Tooltip } from 'antd';
import {
  EyeOutlined,
  CopyOutlined,
  DownloadOutlined,
  LinkOutlined,
} from '@ant-design/icons';

import FileIcon from '../file-icon';
import IndentedTreeModal from '../indented-tree/modal';
import NewDocumentLink from '../new-document-link';
import { useTheme } from '../theme-provider';
import { AssistantGroupButton, UserGroupButton } from './group-button';
import styles from './index.less';

const { Text } = Typography;

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

  // --- chunks per aprire la preview
  const allChunks = useMemo(() => reference?.chunks ?? [], [reference?.chunks]);

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

  // Documenti citati (già li usavi)
  const referenceDocumentList = useMemo(() => {
    return reference?.doc_aggs ?? [];
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
      return theme === 'dark' ? styles.messageTextDark : styles.messageText;
    } else {
      return styles.messageUserText;
    }
  };

  // --- FUNZIONI NUOVE (preview, copia marker, download diretto)
  const findChunkForDoc = useCallback(
    (docId?: string) => {
      if (!docId) return undefined;
      return allChunks.find((c) => c.doc_id === docId);
    },
    [allChunks],
  );

  const previewDoc = useCallback(
    (docId?: string) => {
      const chunk = findChunkForDoc(docId);
      if (docId && chunk && clickDocumentButton) {
        clickDocumentButton(docId, chunk as IReferenceChunk);
      }
    },
    [findChunkForDoc, clickDocumentButton],
  );

  const copyMarker = useCallback((idx: number) => {
    const marker = `##${idx + 1}$$`;
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(marker).catch(() => {});
    }
  }, []);

  const buildDownloadUrl = (docId?: string, fallbackUrl?: string) => {
    // Se hai già /minio/... o /api/document/{id}/download → usa quello.
    if (docId) return `/api/document/${docId}/download`; // ADATTA alla tua API
    return fallbackUrl || '#';
  };

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
                  />
                )
              ) : (
                <UserGroupButton
                  content={item.content}
                  messageId={item.id}
                  removeMessageById={removeMessageById}
                  regenerateMessage={regenerateMessage && handleRegenerateMessage}
                  sendLoading={sendLoading}
                />
              )}
            </Space>

            <div className={getMessageStyle()}>
              <MarkdownContent
                loading={loading}
                content={item.content}
                reference={reference}
                clickDocumentButton={clickDocumentButton}
              />
            </div>

            {/* --- BLOCCO FONTI MIGLIORATO MA RESTANDO COMPATIBILE --- */}
            {isAssistant && referenceDocumentList.length > 0 && (
              <List
                bordered
                dataSource={referenceDocumentList}
                renderItem={(doc, idx) => {
                  const downloadHref = buildDownloadUrl(doc.doc_id, doc.url);
                  return (
                    <List.Item>
                      <Flex gap={'small'} align="center" wrap="wrap">
                        <FileIcon id={doc.doc_id} name={doc.doc_name} />

                        {/* Il tuo componente che apre il viewer completo */}
                        <NewDocumentLink
                          documentId={doc.doc_id}
                          documentName={doc.doc_name}
                          prefix="document"
                          link={doc.url}
                        >
                          {doc.doc_name}
                        </NewDocumentLink>

                        {/* AZIONI EXTRA: anteprima (PdfDrawer), copia marker, download diretto */}
                        <Flex gap={4}>
                          {/* Anteprima PDF nel drawer */}
                          <Tooltip title="Anteprima (drawer)">
                            <Button
                              type="text"
                              icon={<EyeOutlined />}
                              onClick={() => previewDoc(doc.doc_id)}
                              size="small"
                            />
                          </Tooltip>

                          {/* Copia marker nel testo */}
                          <Tooltip title="Copia marker">
                            <Button
                              type="text"
                              icon={<CopyOutlined />}
                              onClick={() => copyMarker(idx)}
                              size="small"
                            />
                          </Tooltip>

                          {/* Download diretto (se vuoi oltre al viewer) */}
                          <Tooltip title="Scarica PDF">
                            <Button
                              type="text"
                              icon={<DownloadOutlined />}
                              href={downloadHref}
                              download
                              size="small"
                            />
                          </Tooltip>

                          {/* Link esterno se serve */}
                          {doc.url && (
                            <Tooltip title="Apri link">
                              <Button
                                type="text"
                                icon={<LinkOutlined />}
                                href={doc.url}
                                target="_blank"
                                rel="noreferrer"
                                size="small"
                              />
                            </Tooltip>
                          )}
                        </Flex>
                      </Flex>
                    </List.Item>
                  );
                }}
              />
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
        />
      )}
    </div>
  );
};

export default memo(MessageItem);
