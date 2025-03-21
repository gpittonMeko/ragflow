// web/src/pages/login-page/PresentationPage.tsx
import React, { useRef, useState } from 'react';
import AgentChatContainer from '@/components/agent-chat-container/AgentChatContainer';
import { Flex, Spin, Button } from 'antd';
import PdfDrawer from '@/components/pdf-drawer';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';

// Import del FlowDrawer
import FormDrawer from '@/components/flow-drawer/flow-drawer'; 
// Importa il tipo RAGFlowNodeType se necessario
import { RAGFlowNodeType } from '@/interfaces/database/flow';

import styles from './index.less';

const AGENT_ID = 'a871ecb2eaba11efb3a10242ac120006'; // Sostituisci con ID corretto

const PresentationPage: React.FC = () => {
  const controllerRef = useRef(new AbortController());

  // Stato per mostrare/nascondere il flow drawer
  const [drawerVisible, setDrawerVisible] = useState<boolean>(false);

  // Stato per mostrare/nascondere il single debug drawer interno a flow-drawer
  const [singleDebugDrawerVisible, setSingleDebugDrawerVisible] = useState<boolean>(false);

  // Se devi passare un nodo di tipo RAGFlowNodeType al FlowDrawer, potresti configurarlo qui
  const [currentNode, setCurrentNode] = useState<RAGFlowNodeType | undefined>(undefined);

  // Esempio di funzione che apre il drawer e setta un nodo di test.
  const showDrawer = () => {
    // Metti qui il nodo che desideri, ad es. un operatore 'Generate'
    setCurrentNode({
      id: 'my-node-id',
      data: {
        label: 'Generate', // uno degli Operator supportati, es. 'Generate', 'Answer', ecc.
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

          {/* Un esempio di bottone per aprire il FlowDrawer */}
          <Button type="primary" onClick={showDrawer}>
            Apri Flow Drawer
          </Button>

          {/* Qui rimane il tuo PdfDrawer, se lo usi */}
          <PdfDrawer />
        </div>
      </div>

      {/* FlowDrawer con tutte le logiche di form che avevi in flow-drawer.tsx */}
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
