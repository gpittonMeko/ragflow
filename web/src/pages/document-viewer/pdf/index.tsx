import { ReactComponent as AssistantIcon } from '@/assets/svg/assistant.svg';
import { MessageType } from '@/constants/chat';
import { useSetModalState } from '@/hooks/common-hooks';
import { IReference, IReferenceChunk } from '@/interfaces/database/chat';
import classNames from 'classnames';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import {
  useFetchDocumentInfosByIds,
  useFetchDocumentThumbnailsByIds,
  useGetDocumentUrl,
} from '@/hooks/document-hooks';
import { IRegenerateMessage, IRemoveMessageById } from '@/hooks/logic-hooks';
import { IMessage } from '@/pages/chat/interface';
import MarkdownContent from '@/pages/chat/markdown-content';
import { getExtension, isImage } from '@/utils/document-util';
import { Avatar, Button, Flex, List, Space, Typography, Popover, Tooltip } from 'antd';
import {
  EyeOutlined,
  CopyOutlined,
  DownloadOutlined,
  LinkOutlined,
} from '@ant-design/icons';

import { Authorization } from '@/constants/authorization';
import { getAuthorization } from '@/utils/authorization-util';

import FileIcon from '../file-icon';
import IndentedTreeModal from '../indented-tree/modal';
import NewDocumentLink from '../new-document-link';
import { useTheme } from '../theme-provider';
import { AssistantGroupButton, UserGroupButton } from './group-button';
import PdfPreviewer from '../pdf-previewer'; // <--- IMPORT del previewer che hai postato
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

  // Lista completa dei chunks (per aprire drawer allo stesso punto)
  const allChunks = useMemo(() => reference?.chunks ?? [], [reference?.chunks]);

  // Imposta la dimensione corretta per avatar basata su dimensione schermo
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getAvatarSize = () => {
    if (windowWidth <= 480) return 28;
    if (windowWidth <= 768) return 32;
    return 40;
  };
  const avatarSize = getAvatarSize();

  // Documenti citati (doc_aggs)
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

  const getMessageStyle = () => {
    if (isAssistant) {
      return theme === 'dark' ? styles.messageTextDark : styles.messageText;
    } else {
      return styles.messageUserText;
    }
  };

  // Trova il primo chunk per doc_id
  const findChunkForDoc = useCallback(
    (docId?: string) => {
      if (!docId) return undefined;
      return allChunks.find((c) => c.doc_id === docId);
    },
    [allChunks],
  );

  // Apri Drawer (come sui marker)
  const openDrawerPreview = useCallback(
    (docId?: string) => {
      const chunk = findChunkForDoc(docId);
      if (docId && chunk && clickDocumentButton) {
        clickDocumentButton(docId, chunk as IReferenceChunk);
      }
    },
    [findChunkForDoc, clickDocumentButton],
  );

  // Copia marker
  const copyMarker = useCallback((idx: number) => {
    const marker = `##${idx + 1}$$`;
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(marker).catch(() => {});
    }
  }, []);

  // Download PDF (stessa logica del tuo PdfPreviewer)
  const downloadPdf = useCallback(async (url: string) => {
    try {
      const headers = { [Authorization]: getAuthorization() };
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Impossibile scaricare il file: ${res.status}`);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = url.split('/').pop() || 'documento.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Popover content: preview piccolo
  const renderPreviewPopover = (url?: string) => {
    if (!url) return null;
    // Altezza/larghezza per non occupare tutto
    return (
      <div style={{ width: 320, height: 420 }}>
        <PdfPreviewer url={url} />
      </div>
    );
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

            {/* FONTI con preview su hover, download funzionante */}
            {isAssistant && referenceDocumentList.length > 0 && (
              <List
                bordered
                dataSource={referenceDocumentList}
                renderItem={(doc, idx) => {
                  const chunk = findChunkForDoc(doc.doc_id);
                  // URL PDF (se serve passare via hook)
                  const url = doc.url || (chunk?.doc_id ? useGetDocumentUrl(chunk.doc_id)() : '');

                  return (
                    <List.Item>
                      <Flex gap={'small'} align="center" wrap="wrap">
                        <FileIcon id={doc.doc_id} name={doc.doc_name} />

                        {/* NewDocumentLink: apre la visualizzazione completa (che già ti funziona) */}
                        <Popover
                          content={renderPreviewPopover(url)}
                          trigger="hover"
                          placement="right"
                        >
                          <NewDocumentLink
                            documentId={doc.doc_id}
                            documentName={doc.doc_name}
                            prefix="document"
                            link={doc.url}
                          >
                            {doc.doc_name}
                          </NewDocumentLink>
                        </Popover>

                        <Flex gap={4}>
                          {/* Anteprima (drawer) all'hover dell'icona occhio + click opzionale */}
                          <Popover
                            content={renderPreviewPopover(url)}
                            trigger="hover"
                            placement="right"
                          >
                            <Tooltip title="Anteprima (drawer all click)">
                              <Button
                                type="text"
                                icon={<EyeOutlined />}
                                size="small"
                                onClick={() => openDrawerPreview(doc.doc_id)}
                              />
                            </Tooltip>
                          </Popover>

                          {/* Copia marker */}
                          <Tooltip title="Copia marker">
                            <Button
                              type="text"
                              icon={<CopyOutlined />}
                              size="small"
                              onClick={() => copyMarker(idx)}
                            />
                          </Tooltip>

                          {/* Download (fetch con header) */}
                          {url && (
                            <Tooltip title="Scarica PDF">
                              <Button
                                type="text"
                                icon={<DownloadOutlined />}
                                size="small"
                                onClick={() => downloadPdf(url)}
                              />
                            </Tooltip>
                          )}

                          {/* Link esterno (se serve) */}
                          {doc.url && (
                            <Tooltip title="Apri link">
                              <Button
                                type="text"
                                icon={<LinkOutlined />}
                                size="small"
                                href={doc.url}
                                target="_blank"
                                rel="noreferrer"
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
