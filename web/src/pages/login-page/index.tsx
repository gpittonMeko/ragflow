import React, { memo, useRef } from 'react';
import AgentChatContainer from '@/components/agent-chat-container/AgentChatContainer';
import { Flex, Spin } from 'antd';
import PdfDrawer from '@/components/pdf-drawer';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';
import styles from './index.less';

/** QUI DICHIARI L’AGENT ID IN CHIARO */
const AGENT_ID = 'a871ecb2eaba11efb3a10242ac120006';

const PresentationPage: React.FC = () => {
  const controllerRef = useRef(new AbortController());

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

          {/* QUI PASSI L’AGENT_ID AL CONTAINER */}
          <div className={styles.chatSection}>
            <AgentChatContainer agentId={AGENT_ID} />
          </div>

          {/* Se usi il tuo PdfDrawer qui, lascialo, altrimenti rimuovi */}
          <PdfDrawer />
        </div>
      </div>
    </div>
  );
};

export default PresentationPage;
