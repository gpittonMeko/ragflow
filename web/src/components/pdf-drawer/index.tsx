import { IModalProps } from '@/interfaces/common';
import { IReferenceChunk } from '@/interfaces/database/chat';
import { IChunk } from '@/interfaces/database/knowledge';
import { Drawer } from 'antd';
import { useEffect, useRef } from 'react';
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

  // DEBUG: Monitor drawer state changes
  useEffect(() => {
    console.log('[PdfDrawer] State change:', {
      visible,
      documentId,
      chunkId: chunk?.id,
      timestamp: new Date().toISOString()
    });

    if (visible) {
      // Check drawer mounting after a brief delay
      setTimeout(() => {
        const drawerElement = document.querySelector('.ant-drawer[style*="translateX(0"]');
        const drawerMask = document.querySelector('.ant-drawer-mask');
        
        console.log('[PdfDrawer] Mount check:', {
          drawerExists: !!drawerElement,
          drawerVisible: drawerElement?.style?.transform === 'translateX(0px)',
          maskVisible: drawerMask?.style?.opacity === '1',
          drawerBody: !!drawerElement?.querySelector('.ant-drawer-body')
        });

        // Force visibility if drawer has issues
        if (drawerElement && drawerElement.style.transform !== 'translateX(0px)') {
          console.warn('[PdfDrawer] Forcing drawer visibility');
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

  // Handle drawer close with debug
  const handleClose = () => {
    console.log('[PdfDrawer] Closing drawer');
    hideModal();
  };

  return (
    <Drawer
      ref={drawerRef}
      title={`Document Previewer - ${documentId.slice(-8)}`}
      onClose={handleClose}
      open={visible}
      width={'50vw'}
      destroyOnClose={false} // Keep content mounted to avoid re-render issues
      mask={true}
      maskClosable={true}
      placement="right"
      className="pdf-drawer-debug"
      styles={{
        body: {
          padding: '16px',
          height: 'calc(100% - 55px)', // Account for header
          overflow: 'hidden'
        }
      }}
      afterOpenChange={(open) => {
        console.log('[PdfDrawer] After open change:', open);
        
        if (open) {
          // Additional safety check after drawer animation
          setTimeout(() => {
            const documentContainer = document.querySelector('[class*="documentContainer"]');
            console.log('[PdfDrawer] Content check:', {
              hasDocumentContainer: !!documentContainer,
              containerVisible: documentContainer ? 
                window.getComputedStyle(documentContainer).display !== 'none' : false
            });
          }, 500);
        }
      }}
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