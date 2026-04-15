import Image from '@/components/image';
import SvgIcon from '@/components/svg-icon';
import { IReference, IReferenceChunk } from '@/interfaces/database/chat';
import { getExtension } from '@/utils/document-util';
import { Alert, Button, Flex, Popover, Tag } from 'antd';
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

const SGAI_A_PATH =
  'M8624 8339 c-8 -8 -14 -25 -14 -36 0 -11 -7 -26 -15 -33 -8 -7 -15 -19 -15 -27 0 -8 -6 -27 -13 -41 -14 -26 -36 -77 -62 -137 -7 -16 -24 -55 -38 -85 -13 -30 -44 -100 -67 -154 -23 -54 -45 -106 -49 -115 -5 -9 -15 -33 -24 -54 -9 -20 -23 -52 -31 -70 -8 -17 -21 -48 -30 -67 -18 -43 -60 -138 -92 -207 -13 -28 -24 -55 -24 -58 0 -3 -11 -30 -24 -58 -13 -29 -34 -74 -46 -102 -11 -27 -25 -59 -30 -70 -34 -77 -64 -144 -105 -240 -26 -60 -55 -128 -65 -150 -22 -49 -42 -95 -70 -160 -26 -61 -30 -70 -74 -168 -20 -42 -36 -79 -36 -82 0 -2 -14 -34 -31 -72 -40 -90 -44 -100 -69 -158 -12 -27 -25 -59 -30 -70 -5 -11 -18 -42 -30 -70 -12 -27 -27 -63 -35 -80 -7 -16 -21 -48 -30 -70 -9 -22 -23 -53 -30 -70 -8 -16 -26 -57 -40 -90 -15 -33 -33 -73 -41 -90 -25 -50 -4 -57 161 -51 77 3 172 5 210 5 l70 1 112 83 c62 45 155 109 208 142 53 33 126 79 163 103 37 24 182 113 324 198 298 179 299 179 405 116 66 -39 290 -177 329 -202 12 -8 67 -42 121 -74 94 -58 217 -137 238 -153 6 -5 28 -20 50 -33 22 -13 49 -32 59 -42 11 -10 38 -30 60 -45 23 -16 52 -38 66 -51 42 -38 83 -43 305 -40 l210 3 -2 26 c-1 14 -16 57 -34 95 -34 73 -48 105 -74 169 -9 22 -24 56 -32 75 -9 19 -22 49 -29 65 -6 17 -20 48 -30 70 -18 42 -31 73 -59 140 -9 22 -24 56 -32 75 -9 19 -22 49 -29 65 -6 17 -20 48 -30 70 -22 51 -44 102 -60 140 -17 43 -38 91 -72 165 -16 36 -37 83 -47 105 -23 56 -46 105 -62 137 -7 14 -13 33 -13 41 0 8 -7 20 -15 27 -8 7 -15 21 -15 30 0 10 -6 31 -14 47 -8 15 -21 44 -29 63 -19 45 -39 89 -76 173 -17 37 -31 71 -31 76 0 5 -6 22 -14 38 -42 82 -76 160 -76 174 0 9 -7 22 -15 29 -8 7 -15 23 -15 35 0 12 -7 28 -15 35 -8 7 -15 18 -15 25 0 8 -7 27 -15 44 -8 17 -22 45 -30 62 -8 17 -15 39 -15 49 0 9 -7 23 -15 30 -8 7 -15 18 -15 25 0 8 -7 27 -15 44 -8 17 -22 45 -30 62 -8 17 -15 39 -15 49 0 9 -7 23 -15 30 -8 7 -15 19 -15 27 0 8 -7 28 -15 44 -8 16 -22 42 -30 58 -8 16 -15 36 -15 44 0 8 -7 20 -15 27 -8 7 -15 23 -15 36 0 12 -4 26 -10 29 -5 3 -14 24 -20 45 -6 22 -16 40 -23 40 -7 0 -135 1 -285 3 -239 2 -275 0 -288 -14z m316 -788 c0 -9 4 -21 8 -26 4 -6 18 -37 31 -70 12 -33 27 -69 31 -80 5 -11 19 -45 31 -75 11 -30 27 -68 34 -85 37 -83 45 -104 45 -113 0 -6 6 -23 14 -39 8 -15 19 -39 25 -53 5 -14 19 -46 30 -72 12 -26 21 -51 21 -57 0 -5 6 -22 14 -38 23 -45 46 -100 46 -111 0 -6 6 -23 14 -39 8 -15 19 -39 25 -53 5 -14 19 -46 30 -72 12 -26 21 -51 21 -57 0 -5 6 -22 14 -38 8 -15 22 -46 31 -68 9 -22 23 -53 32 -68 13 -26 14 -31 1 -44 -13 -13 -17 -13 -31 1 -8 9 -19 16 -22 16 -4 0 -44 22 -89 49 -44 27 -106 62 -136 79 -30 16 -84 46 -120 66 -36 20 -77 41 -92 47 -16 6 -28 15 -28 20 0 12 -43 12 -56 0 -5 -5 -34 -22 -64 -39 -109 -58 -237 -130 -301 -170 -36 -22 -81 -48 -99 -57 l-33 -17 7 29 c4 15 14 42 21 58 8 17 23 55 35 85 11 30 25 64 30 75 5 11 18 43 30 70 12 28 25 59 30 70 5 11 18 43 30 70 11 28 25 58 30 67 6 10 10 23 10 29 0 10 14 45 45 114 12 27 32 73 67 155 5 14 16 39 23 55 7 17 29 71 49 120 21 50 42 101 48 115 5 14 16 39 22 55 20 48 49 109 59 123 12 16 37 -3 37 -27z';

const SgaiRefA = React.forwardRef<HTMLSpanElement, any>((props, ref) => (
  <span ref={ref} {...props} className={styles.sgaiRefIcon}>
    <svg
      viewBox="8500 400 3000 8000"
      width="34"
      height="34"
      aria-hidden="true"
      style={{ transform: 'rotate(180deg)' }}
    >
      <defs>
        <linearGradient
          id="sgai-ref-a-grad"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#2B6CB0">
            <animate
              attributeName="stop-color"
              values="#2B6CB0;#3FA892;#6B5AC4;#2B6CB0"
              dur="3s"
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="100%" stopColor="#3FA892">
            <animate
              attributeName="stop-color"
              values="#3FA892;#6B5AC4;#2B6CB0;#3FA892"
              dur="3s"
              repeatCount="indefinite"
            />
          </stop>
        </linearGradient>
      </defs>
      <g
        fill="url(#sgai-ref-a-grad)"
        transform="scale(1.15,-1.15) translate(0,-8500) translate(0,-600)"
      >
        <path d={SGAI_A_PATH} />
      </g>
    </svg>
  </span>
));

SgaiRefA.displayName = 'SgaiRefA';

import { useFetchDocumentThumbnailsByIds } from '@/hooks/document-hooks';
import { useTranslation } from 'react-i18next';

import 'katex/dist/katex.min.css';

import {
  normalizeCitationMarkers,
  preprocessLaTeX,
  replaceThinkToSection,
  stripAssistantOutputNoise,
} from '@/utils/chat';
import { replaceTextByOldReg } from '../utils';

import classNames from 'classnames';
import styles from './index.less';

// ─────────────────────────────────────────────────────────────
// DEBUG SWITCH
// ─────────────────────────────────────────────────────────────
const DEBUG = false; // metti a false in produzione

// ─────────────────────────────────────────────────────────────
// Regex referencing
// ─────────────────────────────────────────────────────────────
/* Anche `N==` senza ~~ (output LLM); evita che resti testo grezzo / parsing GFM strano */
const reg = /(~~\d+==|##\d+\$\$|(?<!~)\d+==)/g;
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

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
// Typing indicator con dots animati
const TypingDots = () => (
  <span className={styles.typingDots}>
    <span>.</span>
    <span>.</span>
    <span>.</span>
  </span>
);

const MarkdownContent = ({
  reference,
  clickDocumentButton,
  content,
  loading,
}: {
  content: string;
  loading: boolean;
  reference: IReference;
  clickDocumentButton?: (documentId: string, chunk: IReferenceChunk) => void;
}) => {
  const { t, i18n } = useTranslation();
  const { setDocumentIds, data: fileThumbnails } =
    useFetchDocumentThumbnailsByIds();

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
  const { contentWithCursor, usedSearchingFallback, stageInfo } =
    useMemo(() => {
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
        console.log(
          'input type:',
          typeof content,
          'len:',
          (content || '').length,
        );
        console.log('input preview:', preview(content));
      }

      // FALLBACK: se content === '' → t('chat.searching')
      if (text === '') {
        const translated = t('chat.searching');
        stage.usedSearchingFallback = true;
        text = translated;
        if (DEBUG) {
          console.warn(
            '[MarkdownContent] content è vuoto → fallback t("chat.searching")',
          );
          console.log(
            'i18n ready?',
            i18n?.isInitialized,
            'fallback value:',
            translated,
          );
        }
      }

      stage.afterFallback = text;

      // Attenzione: voglio vedere se i trasformatori azzerano il testo
      const nextText = replaceTextByOldReg(text);
      stage.afterOldReg = nextText;

      const afterNoise = stripAssistantOutputNoise(nextText);
      const afterCite = normalizeCitationMarkers(afterNoise);

      // voglio loggare anche i match del pattern
      const matchesBefore = countMatches(nextText);
      if (DEBUG) {
        console.log('[MarkdownContent] matches reg prima pipe:', matchesBefore);
      }

      // Mantengo la semantica del tuo pipe, ma loggo gli step
      let afterThink = '';
      let afterLatex = '';

      try {
        afterThink = replaceThinkToSection(afterCite);
        stage.afterThinkToSection = afterThink;
      } catch (e) {
        afterThink = afterCite;
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
      console.groupCollapsed(
        '%c[MarkdownContent] reference/thumbnails',
        'color:#8a2be2',
      );
      console.log('doc_aggs len:', reference?.doc_aggs?.length ?? 0);
      console.log('chunks len:', reference?.chunks?.length ?? 0);
      console.log('doc ids:', ids);
      console.groupEnd();
    }
  }, [reference, setDocumentIds]);

  const handleDocumentButtonClick = useCallback(
    (
      documentId: string,
      chunk: IReferenceChunk,
      isPdf: boolean,
      documentUrl?: string,
    ) =>
      () => {
        if (!isPdf) {
          if (!documentUrl) {
            if (DEBUG)
              console.warn('[MarkdownContent] documentUrl vuoto per non-PDF');
            return;
          }
          window.open(documentUrl, '_blank');
        } else {
          if (!clickDocumentButton) {
            if (DEBUG)
              console.warn(
                '[MarkdownContent] clickDocumentButton mancante per PDF',
              );
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
        if (
          latestAncestor?.tagName !== 'custom-typography' &&
          latestAncestor?.tagName !== 'code'
        ) {
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
      const popAffinityPct = affinityPercent(chunkItem?.similarity);

      if (DEBUG) {
        console.groupCollapsed(
          '%c[MarkdownContent] getPopoverContent',
          'color:#2f855a',
        );
        console.log('chunkIndex:', chunkIndex);
        console.log(
          'doc:',
          doc?.doc_name,
          'ext:',
          fileExtension,
          'hasPreviewImg:',
          !!imageId,
        );
        console.groupEnd();
      }

      return (
        <div key={doc.doc_id || doc.doc_name} className="flex gap-2">
          {imageId && (
            <Popover
              placement="left"
              content={
                <Image id={imageId} className={styles.referenceImagePreview} />
              }
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
            {popAffinityPct !== null && (
              <div className={styles.popoverAffinityRow}>
                <div className={styles.popoverAffinityMeta}>
                  <span>Rilevanza stimata</span>
                  <span>{popAffinityPct}%</span>
                </div>
                <div className={styles.popoverAffinityTrack}>
                  <div
                    className={styles.popoverAffinityFill}
                    style={{ width: `${popAffinityPct}%` }}
                  />
                </div>
              </div>
            )}
            {documentId && (
              <Flex gap={'small'}>
                {fileThumbnail ? (
                  <img
                    src={fileThumbnail}
                    alt=""
                    className={styles.fileThumbnail}
                  />
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
        console.groupCollapsed(
          '%c[MarkdownContent] renderReference',
          'color:#3182ce',
        );
        console.log('input text preview:', preview(text));
        console.log('matches:', countMatches(text));
        console.groupEnd();
      }

      const replacedText = reactStringReplace(text, reg, (match, i) => {
        const chunkIndex = getChunkIndex(match);
        return (
          <Popover
            content={getPopoverContent(chunkIndex)}
            key={`ref-${chunkIndex}-${i}`}
            overlayStyle={{ zIndex: 999999 }}
          >
            <SgaiRefA />
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
                DEBUG: mostrata <Tag color="blue">t('chat.searching')</Tag>{' '}
                perché <Tag>content === ''</Tag>. i18n ready:{' '}
                <Tag color={i18n?.isInitialized ? 'green' : 'red'}>
                  {String(!!i18n?.isInitialized)}
                </Tag>
              </span>
            }
            description={
              <div style={{ fontSize: 12 }}>
                <div>
                  afterFallback: <code>{preview(stageInfo.afterFallback)}</code>
                </div>
                <div>
                  afterOldReg: <code>{preview(stageInfo.afterOldReg)}</code>
                </div>
                <div>
                  afterThink:{' '}
                  <code>{preview(stageInfo.afterThinkToSection)}</code>
                </div>
                <div>
                  afterLaTeX: <code>{preview(stageInfo.afterLatex)}</code>
                </div>
              </div>
            }
          />
        </div>
      )}

      <div className={styles.markdownWithLoading}>
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
                  <SyntaxHighlighter
                    {...rest}
                    PreTag="div"
                    language={match[1]}
                    wrapLongLines
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                ) : (
                  <code
                    {...rest}
                    className={classNames(className, 'text-wrap')}
                  >
                    {children}
                  </code>
                );
              },
              /* GFM strikethrough su testi legali è quasi sempre parsing errato (~~ sbilanciato). */
              del(props: { children?: React.ReactNode }) {
                return (
                  <span className={styles.delAsPlain}>{props.children}</span>
                );
              },
            } as any
          }
        >
          {contentWithCursor}
        </Markdown>
        {loading && (
          <span className={styles.loadingDotsWrap}>
            <TypingDots />
          </span>
        )}
      </div>
    </div>
  );
};

export default MarkdownContent;
