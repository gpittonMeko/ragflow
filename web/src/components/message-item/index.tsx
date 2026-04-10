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

import { DownloadOutlined, EyeOutlined, LinkOutlined } from '@ant-design/icons';
import {
  Avatar,
  Button,
  Collapse,
  Flex,
  List,
  Space,
  Tooltip,
  Typography,
} from 'antd';

import { Authorization } from '@/constants/authorization';
import { getAuthorization } from '@/utils/authorization-util';

import PdfPreviewer from '@/components/pdf-previewer';
import FileIcon from '../file-icon';
import IndentedTreeModal from '../indented-tree/modal';
import NewDocumentLink from '../new-document-link';
import { useTheme } from '../theme-provider';
import { AssistantGroupButton, UserGroupButton } from './group-button';

import styles from './index.less';

import { humanizePdfName, replacePdfNamesInText } from './humanize-sentenza';

const { Text } = Typography;
const { Panel } = Collapse;

/** Maps backend hybrid similarity to 0–100% for UI. */
function affinityPercent(sim: unknown): number | null {
  if (
    sim === null ||
    sim === undefined ||
    typeof sim !== 'number' ||
    Number.isNaN(sim)
  ) {
    return null;
  }
  if (sim <= 1) {
    return Math.round(Math.max(0, Math.min(1, sim)) * 100);
  }
  return Math.min(100, Math.round(sim));
}

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

  // Tutti i chunk referenziati (per Drawer)
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

  // Rimuovi “Fonti:” dal testo backend
  const cleanedContent = useMemo(() => {
    if (!isAssistant) return item.content;
    return item.content.replace(/\*\*Fonti:\*\*[\s\S]*$/i, '').trim();
  }, [item.content, isAssistant]);

  const beautifiedContent = useMemo(() => {
    if (!isAssistant) return cleanedContent;
    return replacePdfNamesInText(cleanedContent, humanizePdfName);
  }, [cleanedContent, isAssistant]);

  // Fonti
  const referenceDocumentList = useMemo(
    () => reference?.doc_aggs ?? [],
    [reference?.doc_aggs],
  );

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

  // ==== Drawer ====
  const openDrawer = useCallback(
    (docId?: string, docIndex?: number) => {
      if (!docId || !clickDocumentButton) return;

      let chunk: IReferenceChunk | undefined;

      // FIX CORRETTO: doc_aggs e chunks sono allineati 1-a-1 dal backend
      // Usa direttamente l'indice del documento cliccato per prendere il chunk corrispondente
      if (
        docIndex !== undefined &&
        docIndex >= 0 &&
        docIndex < allChunks.length
      ) {
        chunk = allChunks[docIndex] as IReferenceChunk;
        console.debug(
          '[MessageItem] Using chunk at index',
          docIndex,
          'for doc',
          docId,
          '-> chunk:',
          chunk.id,
        );
      } else {
        // Fallback: cerca per doc_id (per compatibilità)
        chunk = allChunks.find((c) => c.doc_id === docId) as IReferenceChunk;
        console.warn(
          '[MessageItem] docIndex non valido o non fornito, cercando per doc_id:',
          docId,
        );
      }

      // Ultimo fallback: prendi il primo chunk disponibile
      if (!chunk && allChunks.length > 0) {
        chunk = allChunks[0] as IReferenceChunk;
        console.warn('[MessageItem] No chunk found, using first available');
      }

      if (chunk) {
        console.debug(
          '[MessageItem] openDrawer ->',
          docId,
          chunk,
          'docIndex:',
          docIndex,
        );
        clickDocumentButton(docId, chunk);
      } else {
        console.warn('[MessageItem] Nessun chunk trovato per docId:', docId);
      }
    },
    [allChunks, clickDocumentButton],
  );

  // downloadPdf: token fresco ad ogni click
  const downloadPdf = useCallback(async (url?: string) => {
    if (!url || url === '#') {
      console.warn('downloadPdf: URL non valido:', url);
      return;
    }

    try {
      const headers = { [Authorization]: getAuthorization() }; // token aggiornato
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Download fallito: ${res.status}`);

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
      console.error('Errore durante il download:', err);
      window.open(url, '_blank'); // fallback
    }
  }, []);

  // buildDownloadUrl: converte id o link “frontend” nell’endpoint REST
  const buildDownloadUrl = (docId?: string, url?: string) => {
    if (url?.includes('/v1/document/get/')) return url; // già corretto
    const idFromFrontend = url?.match(/\/document\/([a-f0-9-]+)/i)?.[1]; // estrae id
    if (idFromFrontend) return `/v1/document/get/${idFromFrontend}`;
    if (docId) return `/v1/document/get/${docId}`; // fallback solo id
    return '#'; // nessun dato
  };

  // Mini anteprima nel popover
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
                  regenerateMessage={
                    regenerateMessage && handleRegenerateMessage
                  }
                  sendLoading={sendLoading}
                />
              )}
            </Space>

            <div className={getMessageStyle()}>
              <MarkdownContent
                loading={loading}
                content={beautifiedContent}
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
                    renderItem={(doc, idx) => {
                      const url = doc.url;
                      const pct = affinityPercent(doc.similarity);
                      const displayName =
                        doc.original_name ||
                        doc.originalFilename ||
                        doc.file_name ||
                        doc.name ||
                        doc.doc_name;

                      const prettyName =
                        humanizePdfName(displayName) || displayName;
                      const dlUrl = buildDownloadUrl(doc.doc_id, url);

                      return (
                        <List.Item className={styles.sourceListItem}>
                          <Flex vertical gap={4}>
                            <Flex gap={'small'} align="center" wrap="wrap">
                              <FileIcon id={doc.doc_id} name={doc.doc_name} />

                              <NewDocumentLink
                                documentId={doc.doc_id}
                                documentName={prettyName}
                                prefix="document"
                                link={doc.url}
                              >
                                {prettyName}
                              </NewDocumentLink>

                              <Flex gap={6} align="center">
                                <Tooltip title="Apri anteprima nel drawer">
                                  <Button
                                    className={styles.sourceActionBtn}
                                    icon={<EyeOutlined />}
                                    onClick={() => openDrawer(doc.doc_id, idx)}
                                    size="small"
                                  />
                                </Tooltip>

                                <Tooltip title="Scarica PDF">
                                  <Button
                                    className={styles.sourceActionBtn}
                                    icon={<DownloadOutlined />}
                                    size="small"
                                    onClick={() => downloadPdf(dlUrl)}
                                  >
                                    Scarica
                                  </Button>
                                </Tooltip>

                                {doc.url && (
                                  <Tooltip title="Apri link esterno">
                                    <Button
                                      className={styles.sourceActionBtn}
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
                            {pct !== null && (
                              <div className={styles.sourceAffinityRow}>
                                <div className={styles.sourceAffinityMeta}>
                                  <span>Rilevanza stimata</span>
                                  <span>{pct}%</span>
                                </div>
                                <div className={styles.sourceAffinityTrack}>
                                  <div
                                    className={styles.sourceAffinityFill}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            )}
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
                          <Button
                            type="text"
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
