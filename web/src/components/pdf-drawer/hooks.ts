import { useSetModalState } from '@/hooks/common-hooks';
import { IReferenceChunk } from '@/interfaces/database/chat';
import { useCallback, useState } from 'react';

export const useClickDrawer = () => {
  const [visible, setVisible] = useState(false);
  const [documentId, setDocumentId] = useState<string | undefined>(undefined);
  const [selectedChunk, setSelectedChunk] = useState<string | undefined>(undefined);

  const clickDocumentButton = (docId: string, chunk: string) => {
      console.log("clickDocumentButton CALLED", { docId, chunk }); // Existing log
      console.log("clickDocumentButton - INSIDE FUNCTION", { docId, chunk }); // ADD THIS LOG
      setDocumentId(docId);
      setSelectedChunk(chunk);
      setVisible(true);
  };

  const hideModal = () => {
      setVisible(false);
      setDocumentId(undefined);
      setSelectedChunk(undefined);
  };

  return {
      visible,
      clickDocumentButton,
      hideModal,
      documentId,
      selectedChunk,
  };
};