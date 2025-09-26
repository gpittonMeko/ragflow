import Image from '@/components/image';
import SvgIcon from '@/components/svg-icon';
import { IReference, IReferenceChunk } from '@/interfaces/database/chat';
import { getExtension } from '@/utils/document-util';
import { InfoCircleOutlined } from '@ant-design/icons';
import { Button, Flex, Popover, Tag, Alert } from 'antd';
import DOMPurify from 'dompurify';
import React, { useCallback, useEffect, useMemo } from 'react';
import Markdown from 'react-markdown';
import reactStringReplace from 'react-string-replace';
import SyntaxHighlighter from 'react-syntax-highlighter';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { visitParents } from 'unist-util-visit-parents';

import { useFetchDocumentThumbnailsByIds } from '@/hooks/document-hooks';
import { useTranslation } from 'react-i18next';

import 'katex/dist/katex.min.css';

import { preprocessLaTeX, replaceThinkToSection } from '@/utils/chat';
import { replaceTextByOldReg } from '../utils';

import classNames from 'classnames';
import { pipe } from 'lodash/fp';
import styles from './index.less';

// ─────────────────────────────────────────────────────────────
// DEBUG SWITCH
// ─────────────────────────────────────────────────────────────
const DEBUG = true; // metti a false in produzione

// ─────────────────────────────────────────────────────────────
// Regex referencing
// ─────────────────────────────────────────────────────────────
const reg = /(~~\d+==|##\d+\$\$)/g;
const getChunkIndex = (match: string) => parseInt(match.replace(/\D/g, ''), 10);

// ─────────────────────────────────────────────────────────────
// Helpers di debug
// ─────────────────────────────────────────────────────────────
const preview = (s: any, n = 200) =>
  typeof s === 'string' ? s.slice(0, n).replace(/\n/g, '⏎') : String(s);

const safeToText = (children: any): string => {
  try {
    if (typeof children === 'string') return children;
    if (Array.isArray(children)) return children.join('');
    if (children == null) return '';
    return String(children);
  } catch (e) {
    return '';
  }
};

const countMatches = (text: string) => {
  try {
    const m = text.match(reg);
    return m ? m.length : 0;
  } catch {
    return 0;
  }
};

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
const MarkdownContent = ({
  reference,
  clickDocumentButton,
  content,
}: {
  content: string;
  loading: boolean;
  reference: IReference;
  clickDocumentButton?: (documentId: string, chunk: IReferenceChunk) => void;
}) => {
  const { t, i18n } = useTranslation();
  const { setDocumentIds, data: fileThumbnails } = useFetchDocumentThumbnailsByIds();

  // Espongo uno stato globale minimale per ispezione rapida da console
  if (DEBUG) {
    (window as any).__SGAI_DEBUG__ = (window as any).__SGAI_DEBUG__ || {};
    (window as any).__SGAI_DEBUG__.lastMarkdownProps = {
      contentPreview: preview(content),
      contentLength: typeof content === 'string' ? content.length : undefined,
      hasReference: !!reference,
      docAggsLen: reference?.doc_aggs?.length ?? 0,
      chunksLen: reference?.chunks?.length ?? 0,
      i18nReady: i18n?.isInitialized,
    };
  }

  // 1) Fase testo + fallback "searching" + tracing trasformazioni
  const { contentWithCursor, usedSearchingFallback, stageInfo } = useMemo(() => {
    const stage: any = {
      input: content,
      usedSearchingFallback: false,
      afterFallback: '',
      afterOldReg: '',
      afterThinkToSection: '',
      afterLatex: '',
    };

    let text = content;

    if (DEBUG) {
      console.groupCollapsed(
        `%c[MarkdownContent] render content`,
        'color:#888',
      );
      console.log('input type:', typeof content, 'len:', (content || '').length);
      console.log('input preview:', preview(content));
    }

    // FALLBACK: se content === '' → t('chat.searching')
    if (text === '') {
      const translated = t('chat.searching');
      stage.usedSearchingFallback = true;
      text = translated;
      if (DEBUG) {
        console.warn('[MarkdownContent] content è vuoto → fallback t("chat.searching")');
        console.log('i18n ready?', i18n?.isInitialized, 'fallback value:', translated);
      }
    }

    stage.afterFallback = text;

    // Attenzione: voglio vedere se i trasformatori azzerano il testo
    const nextText = replaceTextByOldReg(text);
    stage.afterOldReg = nextText;

    // voglio loggare anche i match del pattern
    const matchesBefore = countMatches(nextText);
    if (DEBUG) {
      console.log('[MarkdownContent] matches reg prima pipe:', matchesBefore);
    }

    // Mantengo la semantica del tuo pipe, ma loggo gli step
    let afterThink = '';
    let afterLatex = '';

    try {
      afterThink = replaceThinkToSection(nextText);
      stage.afterThinkToSection = afterThink;
    } catch (e) {
      afterThink = nextText;
      stage.afterThinkToSection = `[ERROR replaceThinkToSection] ${String(e)}`;
      if (DEBUG) console.error('replaceThinkToSection ERROR:', e);
    }

    try {
      afterLatex = preprocessLaTeX(afterThink);
      stage.afterLatex = afterLatex;
    } catch (e) {
      afterLatex = afterThink;
      stage.afterLatex = `[ERROR preprocessLaTeX] ${String(e)}`;
      if (DEBUG) console.error('preprocessLaTeX ERROR:', e);
    }

    if (DEBUG) {
      console.log('afterFallback preview:', preview(stage.afterFallback));
      console.log('afterOldReg     preview:', preview(stage.afterOldReg));
      console.log('afterThink      preview:', preview(afterThink));
      console.log('afterLaTeX      preview:', preview(afterLatex));
      console.groupEnd();
    }

    return {
      contentWithCursor: afterLatex,
      usedSearchingFallback: stage.usedSearchingFallback,
      stageInfo: stage,
    };
  }, [content, t, i18n]);

  // 2) Thumbnails prep
  useEffect(() => {
    const docAggs = reference?.doc_aggs;
    const ids = Array.isArray(docAggs) ? docAggs.map((x) => x.doc_id) : [];
    setDocumentIds(ids);
    if (DEBUG) {
      console.groupCollapsed('%c[MarkdownContent] reference/thumbnails', 'color:#8a2be2');
      console.log('doc_aggs len:', reference?.doc_aggs?.length ?? 0);
      console.log('chunks len:', reference?.chunks?.length ?? 0);
      console.log('doc ids:', ids);
      console.groupEnd();
    }
  }, [reference, setDocumentIds]);

  const handleDocumentButtonClick = useCallback(
    (documentId: string, chunk: IReferenceChunk, isPdf: boolean, documentUrl?: string) =>
      () => {
        if (!isPdf) {
          if (!documentUrl) {
            if (DEBUG) console.warn('[MarkdownContent] documentUrl vuoto per non-PDF');
            return;
          }
          window.open(documentUrl, '_blank');
        } else {
          if (!clickDocumentButton) {
            if (DEBUG) console.warn('[MarkdownContent] clickDocumentButton mancante per PDF');
            return;
          }
          clickDocumentButton(documentId, chunk);
        }
      },
    [clickDocumentButton],
  );

  const rehypeWrapReference = () => {
    return function wrapTextTransform(tree: any) {
      visitParents(tree, 'text', (node, ancestors) => {
        const latestAncestor = ancestors.at(-1);
        if (latestAncestor?.tagName !== 'custom-typography' && latestAncestor?.tagName !== 'code') {
          node.type = 'element';
          node.tagName = 'custom-typography';
          node.properties = {};
          node.children = [{ type: 'text', value: node.value }];
        }
      });
    };
  };

  const getPopoverContent = useCallback(
    (chunkIndex: number) => {
      const doc = reference?.doc_aggs?.[chunkIndex - 1];
      if (!doc) return null;

      const documentId = doc.doc_id;
      const fileThumbnail = documentId ? fileThumbnails[documentId] : '';
      const fileExtension = documentId ? getExtension(doc.doc_name) : '';
      // FIX: usa lo stesso indice per avere il chunk corretto
      const chunkItem = reference?.chunks?.[chunkIndex - 1];
      const imageId = chunkItem?.image_id;

      if (DEBUG) {
        console.groupCollapsed('%c[MarkdownContent] getPopoverContent', 'color:#2f855a');
        console.log('chunkIndex:', chunkIndex);
        console.log('doc:', doc?.doc_name, 'ext:', fileExtension, 'hasPreviewImg:', !!imageId);
        console.groupEnd();
      }

      return (
        <div key={doc.doc_id || doc.doc_name} className="flex gap-2">
          {imageId && (
            <Popover
              placement="left"
              content={<Image id={imageId} className={styles.referenceImagePreview} />}
            >
              <Image id={imageId} className={styles.referenceChunkImage} />
            </Popover>
          )}
          <div className={'space-y-2 max-w-[40vw]'}>
            {chunkItem?.content && (
              <div
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(chunkItem.content ?? ''),
                }}
                className={classNames(styles.chunkContentText)}
              />
            )}
            {documentId && (
              <Flex gap={'small'}>
                {fileThumbnail ? (
                  <img src={fileThumbnail} alt="" className={styles.fileThumbnail} />
                ) : (
                  <SvgIcon name={`file-icon/${fileExtension}`} width={24} />
                )}
                <Button
                  type="link"
                  onClick={handleDocumentButtonClick(
                    documentId,
                    chunkItem as IReferenceChunk,
                    fileExtension === 'pdf',
                    doc.url,
                  )}
                >
                  Anteprima
                </Button>

                {!!doc.url && (
                  <a
                    href={doc.url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.documentLink}
                  >
                    <Button type="link">Scarica</Button>
                  </a>
                )}

                <span className="text-wrap">{doc.doc_name}</span>
              </Flex>
            )}
          </div>
        </div>
      );
    },
    [reference, fileThumbnails, handleDocumentButtonClick],
  );

  const renderReference = useCallback(
    (text: string) => {
      if (DEBUG) {
        console.groupCollapsed('%c[MarkdownContent] renderReference', 'color:#3182ce');
        console.log('input text preview:', preview(text));
        console.log('matches:', countMatches(text));
        console.groupEnd();
      }

      const replacedText = reactStringReplace(text, reg, (match, i) => {
        const chunkIndex = getChunkIndex(match);
        return (
          <Popover content={getPopoverContent(chunkIndex)} key={`${match}-${i}`}>
            <InfoCircleOutlined className={styles.referenceIcon} />
          </Popover>
        );
      });

      return replacedText;
    },
    [getPopoverContent],
  );

  return (
    <div data-testid="markdown-content-root">
      {DEBUG && stageInfo?.usedSearchingFallback && (
        <div style={{ marginBottom: 8 }}>
          <Alert
            type="info"
            showIcon
            message={
              <span>
                DEBUG: mostrata <Tag color="blue">t('chat.searching')</Tag> perché <Tag>content === ''</Tag>
                . i18n ready: <Tag color={i18n?.isInitialized ? 'green' : 'red'}>
                  {String(!!i18n?.isInitialized)}
                </Tag>
              </span>
            }
            description={
              <div style={{ fontSize: 12 }}>
                <div>afterFallback: <code>{preview(stageInfo.afterFallback)}</code></div>
                <div>afterOldReg: <code>{preview(stageInfo.afterOldReg)}</code></div>
                <div>afterThink: <code>{preview(stageInfo.afterThinkToSection)}</code></div>
                <div>afterLaTeX: <code>{preview(stageInfo.afterLatex)}</code></div>
              </div>
            }
          />
        </div>
      )}

      <Markdown
        rehypePlugins={[rehypeWrapReference, rehypeKatex, rehypeRaw]}
        remarkPlugins={[remarkGfm, remarkMath]}
        className={styles.markdownContentWrapper}
        components={
          {
            'custom-typography': ({ children }: { children: any }) => {
              const text = safeToText(children);
              if (DEBUG && typeof children !== 'string') {
                console.warn(
                  '[MarkdownContent] custom-typography children non-string → coerced:',
                  children,
                );
              }
              return <>{renderReference(text)}</>;
            },
            code(props: any) {
              const { children, className, ...rest } = props;
              const match = /language-(\w+)/.exec(className || '');
              return match ? (
                <SyntaxHighlighter {...rest} PreTag="div" language={match[1]} wrapLongLines>
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              ) : (
                <code {...rest} className={classNames(className, 'text-wrap')}>
                  {children}
                </code>
              );
            },
          } as any
        }
      >
        {contentWithCursor}
      </Markdown>
    </div>
  );
};

export default MarkdownContent;
