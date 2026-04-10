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
        ? '95vw'
        : window.innerWidth <= 1024
          ? '80vw'
          : '50vw';
    }
    return '50vw';
  });

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setDrawerWidth('95vw');
      } else if (window.innerWidth <= 1024) {
        setDrawerWidth('80vw');
      } else {
        setDrawerWidth('50vw');
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
      title={`Document Previewer - ${documentId.slice(-8)}`}
      onClose={handleClose}
      open={visible}
      width={drawerWidth}
      destroyOnClose={false}
      mask={false}
      maskClosable={false}
      placement="right"
      className="pdf-drawer-debug"
      zIndex={999999}
      styles={{
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
