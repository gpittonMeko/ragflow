import {
  useGetChunkHighlights,
  useGetDocumentUrl,
} from '@/hooks/document-hooks';
import { IReferenceChunk } from '@/interfaces/database/chat';
import { IChunk } from '@/interfaces/database/knowledge';
import FileError from '@/pages/document-viewer/file-error';
import { Skeleton } from 'antd';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  AreaHighlight,
  Highlight,
  IHighlight,
  PdfHighlighter,
  PdfLoader,
  Popup,
} from 'react-pdf-highlighter';
import { useCatchDocumentError } from './hooks';

import styles from './index.less';

interface IProps {
  chunk: IChunk | IReferenceChunk;
  documentId: string;
  visible: boolean;
}

const HighlightPopup = ({
  comment,
}: {
  comment: { text: string; emoji: string };
}) =>
  comment.text ? (
    <div className="Highlight__popup">
      {comment.emoji} {comment.text}
    </div>
  ) : null;

const DocumentPreviewer = ({ chunk, documentId, visible }: IProps) => {
  const getDocumentUrl = useGetDocumentUrl(documentId);
  const { highlights: state, setWidthAndHeight } = useGetChunkHighlights(chunk);
  const ref = useRef<(highlight: IHighlight) => void>(() => {});
  const [loaded, setLoaded] = useState(false);
  const [viewportReady, setViewportReady] = useState(false);
  
  const url = getDocumentUrl();
  const error = useCatchDocumentError(url);

  const resetHash = () => {};

  useEffect(() => {
    setLoaded(visible);
    setViewportReady(false); // Reset viewport quando cambia visibilità
  }, [visible]);

  // SAFE SCROLL - questo è il fix principale
  const safeScrollToHighlight = useCallback((highlight: IHighlight) => {
    if (!viewportReady) {
      console.warn('Viewport not ready, skipping scroll');
      return;
    }
    
    try {
      if (ref.current && typeof ref.current === 'function') {
        ref.current(highlight);
        console.log('Scroll successful');
      }
    } catch (error: any) {
      console.error('Scroll failed:', error.message);
    }
  }, [viewportReady]);

  // FIX PRINCIPALE: Non fare scroll finché viewport non è pronto
  useEffect(() => {
    if (state.length > 0 && loaded && viewportReady) {
      setLoaded(false);
      // Delay aggiuntivo per sicurezza
      setTimeout(() => {
        safeScrollToHighlight(state[0]);
      }, 800);
    }
  }, [state, loaded, viewportReady, safeScrollToHighlight]);

  // Callback sicuro per scrollRef
  const handleScrollRef = useCallback((scrollTo: (highlight: IHighlight) => void) => {
    console.log('ScrollRef received');
    
    ref.current = (highlight: IHighlight) => {
      try {
        // Controlli di sicurezza
        const pdfViewer = document.querySelector('.PdfHighlighter');
        const canvas = pdfViewer?.querySelector('canvas');
        
        if (!pdfViewer) throw new Error('PDF viewer not found');
        if (!canvas || canvas.width === 0) throw new Error('Canvas not ready');
        
        scrollTo(highlight);
      } catch (error: any) {
        console.warn('ScrollTo wrapper error:', error.message);
        // Non rilanciare l'errore per evitare crash
      }
    };
    
    setLoaded(true);
    // Delay per dare tempo al PDF di renderizzare completamente
    setTimeout(() => {
      setViewportReady(true);
    }, 1000);
  }, []);

  return (
    <div className={styles.documentContainer}>
      <PdfLoader
        url={url}
        beforeLoad={<Skeleton active />}
        workerSrc="/pdfjs-dist/pdf.worker.min.js"
        errorMessage={<FileError>{error}</FileError>}
      >
        {(pdfDocument) => {
          // Gestione sicura del documento
          pdfDocument.getPage(1)
            .then((page) => {
              const viewport = page.getViewport({ scale: 1 });
              const width = viewport.width;
              const height = viewport.height;
              setWidthAndHeight(width, height);
              console.log('Page loaded:', { width, height });
            })
            .catch((error) => {
              console.error('Page loading error:', error);
            });

          return (
            <PdfHighlighter
              pdfDocument={pdfDocument}
              enableAreaSelection={(event) => event.altKey}
              onScrollChange={resetHash}
              scrollRef={handleScrollRef}
              onSelectionFinished={() => null}
              highlightTransform={(
                highlight,
                index,
                setTip,
                hideTip,
                viewportToScaled,
                screenshot,
                isScrolledTo,
              ) => {
                const isTextHighlight = !Boolean(
                  highlight.content && highlight.content.image,
                );

                const component = isTextHighlight ? (
                  <Highlight
                    isScrolledTo={isScrolledTo}
                    position={highlight.position}
                    comment={highlight.comment}
                  />
                ) : (
                  <AreaHighlight
                    isScrolledTo={isScrolledTo}
                    highlight={highlight}
                    onChange={() => {}}
                  />
                );

                return (
                  <Popup
                    popupContent={<HighlightPopup {...highlight} />}
                    onMouseOver={(popupContent) =>
                      setTip(highlight, () => popupContent)
                    }
                    onMouseOut={hideTip}
                    key={index}
                  >
                    {component}
                  </Popup>
                );
              }}
              highlights={state}
            />
          );
        }}
      </PdfLoader>
    </div>
  );
};

export default DocumentPreviewer;