// web/src/pages/login-page/login-page.tsx (o PresentationPage.tsx)

import React, { memo, useRef, useState } from 'react';
import AgentChatContainer from '@/components/agent-chat-container/AgentChatContainer'; // Importa il nuovo componente
import { Flex, Spin, Button } from 'antd';

// Componenti e costanti (Rimuovi import superflui, mantieni solo PdfDrawer e relativi hook se usati in PresentationPage)
import PdfDrawer from '@/components/pdf-drawer';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';

// Importa il tuo FlowDrawer da pages/flow/flow-drawer/index.tsx
import FormDrawer from '@/pages/flow/flow-drawer'; 
import { RAGFlowNodeType } from '@/interfaces/database/flow'; // Se ti serve il tipo

// Stili
import styles from './index.less';

const AGENT_ID = 'a871ecb2eaba11efb3a10242ac120006'; // Sostituisci con l'ID corretto

const PresentationPage: React.FC = () => {
  const controllerRef = useRef(new AbortController());

  // Stato per aprire/chiudere il drawer principale
  const [drawerVisible, setDrawerVisible] = useState<boolean>(false);

  // Stato per aprire/chiudere il single debug drawer interno a flow-drawer
  const [singleDebugDrawerVisible, setSingleDebugDrawerVisible] = useState<boolean>(false);

  // Il nodo che passeremo al FlowDrawer (con operatorName, form, ecc.)
  const [currentNode, setCurrentNode] = useState<RAGFlowNodeType | undefined>(undefined);

  // Funzioni per aprire/chiudere il FlowDrawer
  const showDrawer = () => {
    // Esempio: impostiamo un operatore "Generate"
    setCurrentNode({
      id: 'my-node-id',
      data: {
        label: 'Generate', // uno degli Operator, es: 'Generate', 'Answer', 'Retrieval', ...
        form: {
          // campi di default
        },
      },
    });
    setDrawerVisible(true);
  };

  const hideDrawer = () => {
    setDrawerVisible(false);
  };

  // Funzioni per il single debug drawer
  const showSingleDebugDrawer = () => {
    setSingleDebugDrawerVisible(true);
  };

  const hideSingleDebugDrawer = () => {
    setSingleDebugDrawerVisible(false);
  };

  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}>
        <h1 className={styles.movingGradientLogo}>SGAI</h1>
      </header>
      <div className={styles.mainContent}>
        <div className={styles.presentationContainer}>
          <header className={styles.presentationHeader}>
            <h2 className={styles.presentationTitle}>
              Sommarizzazione Accertamenti - SGAI
            </h2>
          </header>
          <div className={styles.presentation}>
            <p>
              SGAI (Sistema di Gestione e Analisi Intelligente) è una piattaforma che utilizza
              l’intelligenza artificiale per supportare l’analisi e la gestione delle controversie
              tributarie. Lavoriamo in modo indipendente, senza legami con enti istituzionali, per
              garantire trasparenza e imparzialità.
            </p>
            <p>
              <strong>
                SGAI è l'assistente legale che avresti sempre desiderato, ma che non hai mai trovato tra gli umani.
              </strong>
            </p>
          </div>

          {/* Sezione Chat */}
          <div className={styles.chatSection}>
            <AgentChatContainer agentId={AGENT_ID} />
          </div>

          {/* (Opzionale) Un bottone per mostrare il FlowDrawer */}
          <Button type="primary" onClick={showDrawer}>
            Apri Flow Drawer
          </Button>

          {/* PdfDrawer, se lo utilizzi in questa pagina */}
          <PdfDrawer />
        </div>
      </div>

      {/* FlowDrawer con tutte le logiche e le form collegate */}
      <FormDrawer
        visible={drawerVisible}
        hideModal={hideDrawer}
        node={currentNode}
        singleDebugDrawerVisible={singleDebugDrawerVisible}
        hideSingleDebugDrawer={hideSingleDebugDrawer}
        showSingleDebugDrawer={showSingleDebugDrawer}
      />
    </div>
  );
};

export default PresentationPage;
