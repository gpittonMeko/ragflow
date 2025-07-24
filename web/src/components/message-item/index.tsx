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

import {
  Avatar,
  Button,
  Flex,
  List,
  Space,
  Typography,
  Popover,
  Tooltip,
  Collapse,
} from 'antd';
import {
  EyeOutlined,
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
import PdfPreviewer from '@/components/pdf-previewer';

import styles from './index.less';

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

  // tutti i chunk referenziati (per Drawer)
  const allChunks = useMemo(() => reference?.chunks ?? [], [reference?.chunks]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getAvatarSize = () => {
    if (windowWidth <= 480) return 28;
    if (windowWidth <= 768) return 32;
    return 40;
  };
  const avatarSize = getAvatarSize();

  // 1) rimuovi “Fonti:” appended dal backend
  const cleanedContent = useMemo(() => {
    if (!isAssistant) return item.content;
    return item.content.replace(/\*\*Fonti:\*\*[\s\S]*$/i, '').trim();
  }, [item.content, isAssistant]);

  // lista doc agg (fonti)
  const referenceDocumentList = useMemo(() => reference?.doc_aggs ?? [], [reference?.doc_aggs]);

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

  // Drawer: trova chunk e apri
  const findChunkForDoc = useCallback(
    (docId?: string) => {
      if (!docId) return undefined;
      return allChunks.find((c) => c.doc_id === docId);
    },
    [allChunks],
  );

  const openDrawer = useCallback(
    (docId?: string) => {
      const chunk = findChunkForDoc(docId);
      if (docId && chunk && clickDocumentButton) {
        clickDocumentButton(docId, chunk as IReferenceChunk);
      }
    },
    [findChunkForDoc, clickDocumentButton],
  );

  // Download fetch+blob (uguale a PdfPreviewer)
  const downloadPdf = useCallback(async (url?: string) => {
    if (!url) return;
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

  // mini anteprima nel popover
  const renderPreviewPopover = (url?: string) => {
    if (!url) return null;
    return (
      <div style={{ width: 320, height: 420 }}>
        <PdfPreviewer url={url} />
      </div>
    );
  };

  return (
    <div
      className={classNames(styles.messageItem, {
        [styles.messageItemLeft]: isAssistant,
        [styles.messageItemRight]: isUser,
      })}
    >
      <section
        className={classNames(styles.messageItemSection, {
          [styles.messageItemSectionLeft]: isAssistant,
          [styles.messageItemSectionRight]: isUser,
        })}
      >
        <div
          className={classNames(styles.messageItemContent, {
            [styles.messageItemContentReverse]: isUser,
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
                content={cleanedContent}
                reference={reference}
                clickDocumentButton={clickDocumentButton}
              />
            </div>

            {/* FONTI */}
            {isAssistant && referenceDocumentList.length > 0 && (
              <Collapse
                ghost
                className={styles.sourcesCollapse}
                defaultActiveKey={['fonti']}
              >
                <Panel
                  header={
                    <Text strong style={{ fontSize: 13 }}>
                      Fonti ({referenceDocumentList.length})
                    </Text>
                  }
                  key="fonti"
                >
                  <List
                    size="small"
                    itemLayout="vertical"
                    dataSource={referenceDocumentList}
                    renderItem={(doc) => {
                      const url = doc.url;
                      return (
                        <List.Item
                          style={{
                            padding: '8px 0',
                            border: 'none',
                            borderBottom: '1px solid #f0f0f0',
                          }}
                        >
                          <Flex vertical gap={4}>
                            <Flex gap={'small'} align="center" wrap="wrap">
                              <FileIcon id={doc.doc_id} name={doc.doc_name} />

                              {/* POPUP preview anche sul nome documento */}
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

                              {/* Azioni: occhio(drawer), download, link */}
                              <Flex gap={4}>
                                {/* occhio: hover = preview, click = drawer */}
                                <Popover
                                  content={renderPreviewPopover(url)}
                                  trigger="hover"
                                  placement="right"
                                >
                                  <Tooltip title="Anteprima (drawer)">
                                    <Button
                                      type="text"
                                      icon={<EyeOutlined />}
                                      onClick={() => openDrawer(doc.doc_id)}
                                      size="small"
                                    />
                                  </Tooltip>
                                </Popover>

                                {/* Download */}
                                {url && (
                                  <Tooltip title="Scarica PDF">
                                    <Button
                                      type="text"
                                      icon={<DownloadOutlined />}
                                      onClick={() => downloadPdf(url)}
                                      size="small"
                                    />
                                  </Tooltip>
                                )}

                                {/* Link esterno */}
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

                            {/* OCR preview brutta: nascondo */}
                            {/* {doc.chunk_preview && (
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {doc.chunk_preview.length > 200
                                  ? doc.chunk_preview.slice(0, 200) + '…'
                                  : doc.chunk_preview}
                              </Text>
                            )} */}
                          </Flex>
                        </List.Item>
                      );
                    }}
                  />
                </Panel>
              </Collapse>
            )}

            {/* Documenti caricati dall'utente */}
            {isUser && documentList.length > 0 && (
              <List
                bordered
                dataSource={documentList}
                renderItem={(item) => {
                  const fileExtension = getExtension(item.name);
                  return (
                    <List.Item>
                      <Flex gap={'small'} align="center">
                        <FileIcon id={item.id} name={item.name} />
                        {isImage(fileExtension) ? (
                          <NewDocumentLink
                            documentId={item.id}
                            documentName={item.name}
                            prefix="document"
                          >
                            {item.name}
                          </NewDocumentLink>
                        ) : (
                          <Button type="text" onClick={handleUserDocumentClick(item.id)}>
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
