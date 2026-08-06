import { IModalProps } from '@/interfaces/common';
import { IReferenceChunk } from '@/interfaces/database/chat';
import { IChunk } from '@/interfaces/database/knowledge';
import { Drawer } from 'antd';
import { useEffect, useRef, useState } from 'react';
import DocumentPreviewer from '../pdf-previewer';

interface IProps extends IModalProps<any> {
  documentId: string;
  chunk: IChunk | IReferenceChunk;
}

export const PdfDrawer = ({
  visible = false,
  hideModal,
  documentId,
  chunk,
}: IProps) => {
  const drawerRef = useRef<HTMLDivElement>(null);

  const [drawerWidth, setDrawerWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 768
        ? 'min(100vw, 420px)'
        : window.innerWidth <= 1024
          ? 'min(42vw, 480px)'
          : 'min(38vw, 520px)';
    }
    return 'min(38vw, 520px)';
  });

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setDrawerWidth('min(100vw, 420px)');
      } else if (window.innerWidth <= 1024) {
        setDrawerWidth('min(42vw, 480px)');
      } else {
        setDrawerWidth('min(38vw, 520px)');
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        const drawerElement = document.querySelector(
          '.ant-drawer[style*="translateX(0"]',
        );
        const drawerMask = document.querySelector('.ant-drawer-mask');

        if (
          drawerElement &&
          drawerElement.style.transform !== 'translateX(0px)'
        ) {
          (drawerElement as HTMLElement).style.transform = 'translateX(0px)';
          (drawerElement as HTMLElement).style.visibility = 'visible';

          if (drawerMask) {
            (drawerMask as HTMLElement).style.opacity = '1';
            (drawerMask as HTMLElement).style.visibility = 'visible';
          }
        }
      }, 200);
    }
  }, [visible, documentId]);

  const handleClose = () => {
    hideModal();
  };

  return (
    <Drawer
      ref={drawerRef}
      title={`Anteprima documento`}
      onClose={handleClose}
      open={visible}
      width={drawerWidth}
      destroyOnClose={false}
      mask={false}
      maskClosable={false}
      placement="right"
      getContainer={() => document.body}
      rootStyle={{ pointerEvents: 'none' }}
      className="pdf-drawer-debug"
      zIndex={999999}
      styles={{
        wrapper: { pointerEvents: 'auto' },
        body: {
          padding: '16px',
          height: 'calc(100% - 55px)',
          overflow: 'hidden',
        },
      }}
      afterOpenChange={() => {}}
    >
      <DocumentPreviewer
        documentId={documentId}
        chunk={chunk}
        visible={visible}
      />
    </Drawer>
  );
};

export default PdfDrawer;
