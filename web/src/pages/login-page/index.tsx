import React, { memo, useRef, useState } from 'react';
import { Flex, Spin, Button } from 'antd';
import PdfDrawer from '@/components/pdf-drawer';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';

// Chat container unificata con PDF e reference
import AgentChatContainer from '@/components/agent-chat-container/AgentChatContainer'; 

// FlowDrawer, così lo mostri se vuoi
import FormDrawer from '@/pages/flow/flow-drawer'; 
import { RAGFlowNodeType } from '@/interfaces/database/flow';

import styles from './index.less';

/** AgentID scritto in chiaro */
const AGENT_ID = 'a871ecb2eaba11efb3a10242ac120006'; 

const PresentationPage: React.FC = () => {
  const controllerRef = useRef(new AbortController());

  // Se vuoi aprire/chiudere FlowDrawer
  const [drawerVisible, setDrawerVisible] = useState<boolean>(false);

  // Se vuoi gestire single-step debug
  const [singleDebugDrawerVisible, setSingleDebugDrawerVisible] = useState<boolean>(false);

  // Se FlowDrawer richiede un "nodo" (RAGFlowNodeType)
  const [currentNode, setCurrentNode] = useState<RAGFlowNodeType | undefined>(undefined);

  // Esempio: funzione per mostrare FlowDrawer con un "Generate" node
  const showDrawer = () => {
    setCurrentNode({
      id: 'my-node-id',
      data: { label: 'Generate' }, // uno degli Operator nel FormMap
    });
    setDrawerVisible(true);
  };

  const hideDrawer = () => setDrawerVisible(false);

  const showSingleDebugDrawer = () => setSingleDebugDrawerVisible(true);
  const hideSingleDebugDrawer = () => setSingleDebugDrawerVisible(false);

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
              SGAI (Sistema di Gestione e Analisi Intelligente) è una piattaforma
              che utilizza l’intelligenza artificiale per supportare l’analisi e la
              gestione delle controversie tributarie. Lavoriamo in modo indipendente
              ...
            </p>
            <p>
              <strong>
                SGAI è l'assistente legale che avresti sempre desiderato...
              </strong>
            </p>
          </div>

          {/* Chat con AgentID */}
          <div className={styles.chatSection}>
            <AgentChatContainer agentId={AGENT_ID} />
          </div>

          {/* Se vuoi un bottone per aprire il FlowDrawer */}
          <Button type="primary" onClick={showDrawer}>
            Apri Flow Drawer
          </Button>

          {/* Se stavi usando PdfDrawer qui, resta pure */}
          <PdfDrawer />
        </div>
      </div>

      {/* FlowDrawer con i form e i contenuti collegati */}
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
