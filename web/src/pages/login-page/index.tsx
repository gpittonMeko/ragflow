// web/src/pages/login-page/login-page.tsx (o PresentationPage.tsx)
import React, { memo, useRef, useState } from 'react';
import { Flex, Spin, Button } from 'antd';

// Se avevi AgentChatContainer e non ti serve più, puoi rimuoverlo
// import AgentChatContainer from '@/components/agent-chat-container/AgentChatContainer';

// Import del componente chat che vuoi integrare
import FlowChatBox from '@/pages/flow/chat/box'; 

// Import del PdfDrawer (se lo usi in questa pagina)
import PdfDrawer from '@/components/pdf-drawer';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';

// Import del FlowDrawer (se lo usi in questa pagina)
import FormDrawer from '@/pages/flow/flow-drawer'; 
import { RAGFlowNodeType } from '@/interfaces/database/flow'; // se ti serve per definire il tipo

// Stili
import styles from './index.less';

// Se ti serviva un ID (es. AGENT_ID), puoi tenerlo ma se non lo usi più rimuovilo
// const AGENT_ID = 'a871ecb2eaba11efb3a10242ac120006'; // Sostituisci con l'ID corretto se serve

const PresentationPage: React.FC = () => {
  const controllerRef = useRef(new AbortController());

  // ---------------------------------------------------------------
  // SE USI IL FLOWDRAWER: gestisci qui i suoi stati (altrimenti rimuovi)
  // ---------------------------------------------------------------
  const [drawerVisible, setDrawerVisible] = useState<boolean>(false);
  const [singleDebugDrawerVisible, setSingleDebugDrawerVisible] = useState<boolean>(false);
  const [currentNode, setCurrentNode] = useState<RAGFlowNodeType | undefined>(undefined);

  const showDrawer = () => {
    // Esempio: impostiamo un operatore "Generate"
    setCurrentNode({
      id: 'my-node-id',
      data: {
        label: 'Generate',
        form: {
          // eventuali campi di default
        },
      },
    });
    setDrawerVisible(true);
  };

  const hideDrawer = () => {
    setDrawerVisible(false);
  };

  const showSingleDebugDrawer = () => {
    setSingleDebugDrawerVisible(true);
  };

  const hideSingleDebugDrawer = () => {
    setSingleDebugDrawerVisible(false);
  };
  // ---------------------------------------------------------------

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

          {/*
            Sezione Chat:
            Qui inseriamo FlowChatBox al posto (o in aggiunta) di AgentChatContainer
          */}
          <div className={styles.chatSection}>
            <FlowChatBox />
          </div>

          {/* Esempio di bottone per aprire il FlowDrawer (se lo usi) */}
          <Button type="primary" onClick={showDrawer}>
            Apri Flow Drawer
          </Button>

          {/* PdfDrawer, se lo utilizzi anche qui */}
          <PdfDrawer />
        </div>
      </div>

      {/*
        FlowDrawer con tutte le logiche e form collegate
        Se non ti serve in questa pagina, puoi rimuovere.
      */}
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
