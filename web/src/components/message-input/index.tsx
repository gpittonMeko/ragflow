import { useTranslate } from '@/hooks/common-hooks';
import {
  useDeleteDocument,
  useFetchDocumentInfosByIds,
  useRemoveNextDocument,
  useUploadAndParseDocument,
} from '@/hooks/document-hooks';
import { cn } from '@/lib/utils';
import { getExtension } from '@/utils/document-util';
import { formatBytes } from '@/utils/file-util';
import {
  CloseCircleOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import type { GetProp, UploadFile } from 'antd';
import {
  Button,
  Card,
  Divider,
  Flex,
  Input,
  List,
  Space,
  Spin,
  Typography,
  Upload,
  UploadProps,
} from 'antd';
import get from 'lodash/get';
import trim from 'lodash/trim';
import { CircleStop, Paperclip, SendHorizontal } from 'lucide-react';
import {
  ChangeEventHandler,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import FileIcon from '../file-icon';
import styles from './index.less';

type FileType = Parameters<GetProp<UploadProps, 'beforeUpload'>>[0];
const { Text } = Typography;

const { TextArea } = Input;

const getFileId = (file: UploadFile) => get(file, 'response.data.0');

const getFileIds = (fileList: UploadFile[]) => {
  const ids = fileList.reduce((pre, cur) => {
    return pre.concat(get(cur, 'response.data', []));
  }, []);

  return ids;
};

const isUploadSuccess = (file: UploadFile) => {
  const code = get(file, 'response.code');
  return typeof code === 'number' && code === 0;
};

interface IProps {
  disabled: boolean;
  value: string;
  sendDisabled: boolean;
  sendLoading: boolean;
  onPressEnter(documentIds: string[]): void;
  onInputChange: ChangeEventHandler<HTMLTextAreaElement>;
  conversationId: string;
  uploadMethod?: string;
  isShared?: boolean;
  showUploadIcon?: boolean;
  createConversationBeforeUploadDocument?(message: string): Promise<any>;
  stopOutputMessage?(): void;
  /** Callback quando l'input riceve focus (per scroll mobile) */
  onInputFocus?: () => void;
  /** Ref per il wrapper (per scroll into view) */
  wrapperRef?: React.RefObject<HTMLDivElement | null>;
  /** Testo opzionale sotto l’input (es. istruzioni allegato documento) */
  uploadHint?: string;
  /** Mostra etichetta «Allega» accanto alla graffetta (es. home SGAI Legal) */
  showAttachLabel?: boolean;
  /** Override righe autoSize del textarea; se omesso: shared → max 4, altrimenti max 10 */
  textareaAutoSize?: { minRows: number; maxRows: number };
  /** Suggerimento in dissolvenza nel campo (Maiusc+Invio per accettare se il campo è vuoto) */
  ghostSuggestion?: string | null;
  ghostHint?: string;
  onGhostAccept?: () => void;
}

const getBase64 = (file: FileType): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file as any);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });

const MessageInput = ({
  isShared = false,
  disabled,
  value,
  onPressEnter,
  sendDisabled,
  sendLoading,
  onInputChange,
  conversationId,
  showUploadIcon = true,
  createConversationBeforeUploadDocument,
  uploadMethod = 'upload_and_parse',
  stopOutputMessage,
  onInputFocus,
  wrapperRef,
  uploadHint,
  showAttachLabel = false,
  textareaAutoSize,
  ghostSuggestion,
  ghostHint,
  onGhostAccept,
}: IProps) => {
  const { t } = useTranslate('chat');
  const { removeDocument } = useRemoveNextDocument();
  const { deleteDocument } = useDeleteDocument();
  const { data: documentInfos, setDocumentIds } = useFetchDocumentInfosByIds();
  const { uploadAndParseDocument } = useUploadAndParseDocument(uploadMethod);
  const conversationIdRef = useRef(conversationId);

  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const handlePreview = async (file: UploadFile) => {
    if (!file.url && !file.preview) {
      file.preview = await getBase64(file.originFileObj as FileType);
    }
  };

  const handleChange: UploadProps['onChange'] = async ({
    // fileList: newFileList,
    file,
  }) => {
    let nextConversationId: string = conversationId;
    if (createConversationBeforeUploadDocument) {
      const creatingRet = await createConversationBeforeUploadDocument(
        file.name,
      );
      if (creatingRet?.code === 0) {
        nextConversationId = creatingRet.data.id;
      }
    }
    setFileList((list) => {
      list.push({
        ...file,
        status: 'uploading',
        originFileObj: file as any,
      });
      return [...list];
    });
    try {
      const ret = await uploadAndParseDocument({
        conversationId: nextConversationId,
        fileList: [file],
      });
      const dataArr = Array.isArray(ret) ? ret : ret != null ? [ret] : [];
      setFileList((list) => {
        const nextList = list.filter((x) => x.uid !== file.uid);
        nextList.push({
          ...file,
          originFileObj: file as any,
          response: { code: 0, data: dataArr },
          percent: 100,
          status: 'done',
        });
        return nextList;
      });
    } catch {
      setFileList((list) => {
        const nextList = list.filter((x) => x.uid !== file.uid);
        nextList.push({
          ...file,
          originFileObj: file as any,
          status: 'error',
          percent: 100,
        });
        return nextList;
      });
    }
  };

  const isUploadingFile = fileList.some((x) => x.status === 'uploading');

  const handlePressEnter = useCallback(async () => {
    if (isUploadingFile) return;
    const ids = getFileIds(fileList.filter((x) => isUploadSuccess(x)));

    onPressEnter(ids);
    setFileList([]);
  }, [fileList, onPressEnter, isUploadingFile]);

  const handleKeyDown = useCallback(
    async (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && event.shiftKey) {
        if (
          ghostSuggestion &&
          onGhostAccept &&
          trim(value) === '' &&
          trim(ghostSuggestion) !== ''
        ) {
          event.preventDefault();
          onGhostAccept();
        }
        return;
      }
      if (event.key !== 'Enter') return;
      if (sendDisabled || isUploadingFile || sendLoading) return;

      event.preventDefault();
      handlePressEnter();
    },
    [
      sendDisabled,
      isUploadingFile,
      sendLoading,
      handlePressEnter,
      ghostSuggestion,
      onGhostAccept,
      value,
    ],
  );

  const handleRemove = useCallback(
    async (file: UploadFile) => {
      const ids = get(file, 'response.data', []);
      // Upload Successfully
      if (Array.isArray(ids) && ids.length) {
        if (isShared) {
          await deleteDocument(ids);
        } else {
          await removeDocument(ids[0]);
        }
        setFileList((preList) => {
          return preList.filter((x) => getFileId(x) !== ids[0]);
        });
      } else {
        // Upload failed
        setFileList((preList) => {
          return preList.filter((x) => x.uid !== file.uid);
        });
      }
    },
    [removeDocument, deleteDocument, isShared],
  );

  const handleStopOutputMessage = useCallback(() => {
    stopOutputMessage?.();
  }, [stopOutputMessage]);

  const getDocumentInfoById = useCallback(
    (id: string) => {
      return documentInfos.find((x) => x.id === id);
    },
    [documentInfos],
  );

  useEffect(() => {
    const ids = getFileIds(fileList);
    setDocumentIds(ids);
  }, [fileList, setDocumentIds]);

  useEffect(() => {
    if (
      conversationIdRef.current &&
      conversationId !== conversationIdRef.current
    ) {
      setFileList([]);
    }
    conversationIdRef.current = conversationId;
  }, [conversationId, setFileList]);

  const inputWrapperRef = useRef<HTMLDivElement>(null);
  const scrollRef = wrapperRef ?? inputWrapperRef;

  const handleFocus = useCallback(() => {
    onInputFocus?.();
    // Mobile: scroll input in view quando si apre la tastiera
    const el = (scrollRef as React.RefObject<HTMLDivElement | null>)?.current;
    if (el && /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 350);
    }
  }, [onInputFocus, scrollRef]);

  const resolvedTextareaAutoSize =
    textareaAutoSize ??
    (isShared ? { minRows: 1, maxRows: 4 } : { minRows: 1, maxRows: 10 });

  const handleTextAreaChange = useCallback<
    ChangeEventHandler<HTMLTextAreaElement>
  >(
    (e) => {
      onInputChange(e);
      if (!isShared) return;
      const el = e.target;
      const atEnd =
        el.selectionStart === el.value.length &&
        el.selectionEnd === el.value.length;
      if (atEnd) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
    },
    [onInputChange, isShared],
  );

  return (
    <div ref={scrollRef} className={styles.inputScrollAnchor}>
      <Flex
        gap={1}
        vertical
        className={cn(
          styles.messageInputWrapper,
          isShared && styles.messageInputShared,
          'dark:bg-black',
        )}
      >
        <div
          className={cn(
            styles.textareaWithGhost,
            isShared && styles.textareaWithGhostShared,
            ghostSuggestion &&
              trim(value) === '' &&
              styles.textareaWithGhostActive,
          )}
        >
          <TextArea
            className={
              ghostSuggestion && trim(value) === ''
                ? styles.textareaOverGhost
                : undefined
            }
            size={isShared ? 'middle' : 'large'}
            placeholder={
              ghostSuggestion && trim(value) === '' ? '' : t('sendPlaceholder')
            }
            value={value}
            allowClear
            disabled={disabled}
            style={{
              border: 'none',
              boxShadow: 'none',
              padding: '0px 10px',
              marginTop: 2,
            }}
            autoSize={resolvedTextareaAutoSize}
            onKeyDown={handleKeyDown}
            onChange={handleTextAreaChange}
            onFocus={handleFocus}
          />
          {ghostSuggestion && trim(value) === '' ? (
            <div
              key={ghostSuggestion.slice(0, 48)}
              className={styles.inputGhostLayer}
              aria-hidden
            >
              {ghostSuggestion}
            </div>
          ) : null}
        </div>
        {ghostHint && ghostSuggestion && trim(value) === '' ? (
          <Text type="secondary" className={styles.ghostHint}>
            {ghostHint}
          </Text>
        ) : null}
        <Divider style={{ margin: '5px 30px 10px 0px' }} />
        {uploadHint && (
          <Text type="secondary" className={styles.uploadHintLine}>
            {uploadHint}
          </Text>
        )}
        <Flex vertical gap={8} className={styles.messageInputFooter}>
          {fileList.length > 0 && (
            <List
              grid={{
                gutter: 16,
                xs: 1,
                sm: 1,
                md: 1,
                lg: 1,
                xl: 2,
                xxl: 4,
              }}
              dataSource={fileList}
              className={styles.listWrapper}
              renderItem={(item) => {
                const id = getFileId(item);
                const documentInfo = getDocumentInfoById(id);
                const fileExtension = getExtension(documentInfo?.name ?? '');
                const fileName = item.originFileObj?.name ?? '';

                return (
                  <List.Item>
                    <Card className={styles.documentCard}>
                      <Flex gap={10} align="center">
                        {item.status === 'uploading' ? (
                          <Spin
                            indicator={
                              <LoadingOutlined style={{ fontSize: 24 }} spin />
                            }
                          />
                        ) : item.status === 'error' ? (
                          <InfoCircleOutlined size={30}></InfoCircleOutlined>
                        ) : (
                          <FileIcon id={id} name={fileName}></FileIcon>
                        )}
                        <Flex vertical style={{ width: '90%' }}>
                          <Text
                            ellipsis={{ tooltip: fileName }}
                            className={styles.nameText}
                          >
                            <b> {fileName}</b>
                          </Text>
                          {item.status === 'error' ? (
                            t('uploadFailed')
                          ) : (
                            <>
                              {item.percent !== 100 ? (
                                t('uploading')
                              ) : !item.response ? (
                                t('parsing')
                              ) : (
                                <Space>
                                  <span>{fileExtension?.toUpperCase()},</span>
                                  <span>
                                    {formatBytes(
                                      getDocumentInfoById(id)?.size ?? 0,
                                    )}
                                  </span>
                                </Space>
                              )}
                            </>
                          )}
                        </Flex>
                      </Flex>

                      {item.status !== 'uploading' && (
                        <span className={styles.deleteIcon}>
                          <CloseCircleOutlined
                            onClick={() => handleRemove(item)}
                          />
                        </span>
                      )}
                    </Card>
                  </List.Item>
                );
              }}
            />
          )}
          <Flex
            gap={8}
            align="center"
            justify="flex-end"
            className={styles.messageInputActions}
          >
            {showUploadIcon && (
              <Upload
                onPreview={handlePreview}
                onChange={handleChange}
                multiple={false}
                onRemove={handleRemove}
                showUploadList={false}
                beforeUpload={() => {
                  return false;
                }}
              >
                <Button
                  type={'primary'}
                  disabled={disabled}
                  aria-label={
                    showAttachLabel ? 'Allega documento alla chat' : undefined
                  }
                  title={
                    showAttachLabel
                      ? 'Allega documento (PDF, DOCX, …)'
                      : undefined
                  }
                >
                  <Paperclip className="size-4" />
                  {showAttachLabel && (
                    <span className={styles.attachLabelText}>Allega</span>
                  )}
                </Button>
              </Upload>
            )}
            {sendLoading ? (
              <Button onClick={handleStopOutputMessage}>
                <CircleStop className="size-5" />
              </Button>
            ) : (
              <Button
                type="primary"
                onClick={handlePressEnter}
                loading={sendLoading}
                disabled={sendDisabled || isUploadingFile || sendLoading}
              >
                <SendHorizontal className="size-5" />
              </Button>
            )}
          </Flex>
        </Flex>
      </Flex>
    </div>
  );
};

export default memo(MessageInput);
