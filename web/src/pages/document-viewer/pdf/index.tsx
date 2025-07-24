import { Authorization } from '@/constants/authorization';
import { getAuthorization } from '@/utils/authorization-util';
import { Skeleton, Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { PdfHighlighter, PdfLoader } from 'react-pdf-highlighter';
import FileError from '../file-error';
import { useCatchError } from '../hooks';

type PdfLoaderProps = React.ComponentProps<typeof PdfLoader> & {
  httpHeaders?: Record<string, string>;
};

const Loader = PdfLoader as React.ComponentType<PdfLoaderProps>;

interface IProps {
  url: string;
}

const PdfPreviewer = ({ url }: IProps) => {
  const { error } = useCatchError(url);
  const resetHash = () => {};

  /* Header di autenticazione usato sia per il preview che per il download */
  const httpHeaders = {
    [Authorization]: getAuthorization(),
  };

  /* ---- funzione che scarica il PDF ---- */
  const downloadPdf = async () => {
    try {
      const res = await fetch(url, { headers: httpHeaders });
      if (!res.ok) throw new Error(`Impossibile scaricare il file: ${res.status}`);

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = url.split('/').pop() || 'documento.pdf'; // nome di fallback
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Pulsante di download in alto a destra */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 9999,      // <<< più alto di qualunque canvas
        }}
      >
        <Button
          type="primary"
          size="small"
          icon={<DownloadOutlined />}
          onClick={downloadPdf}
        >
          Scarica
        </Button>
      </div>

      <Loader
        url={url}
        httpHeaders={httpHeaders}
        beforeLoad={<Skeleton active />}
        workerSrc="/pdfjs-dist/pdf.worker.min.js"
        errorMessage={<FileError>{error}</FileError>}
        onError={(e) => console.warn(e)}
      >
        {(pdfDocument) => (
          <PdfHighlighter
            pdfDocument={pdfDocument}
            enableAreaSelection={(event) => event.altKey}
            onScrollChange={resetHash}
            scrollRef={() => {}}
            onSelectionFinished={() => null}
            highlightTransform={() => <div />}
            highlights={[]}
          />
        )}
      </Loader>
    </div>
  );
};

export default PdfPreviewer;