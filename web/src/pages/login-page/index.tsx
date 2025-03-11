// web/src/pages/login-page/login-page.tsx (o PresentationPage.tsx)
import React, { memo, useRef } from 'react';
import AgentChatContainer from '@/components/agent-chat-container/AgentChatContainer'; // Importa il nuovo componente
import { Flex, Spin } from 'antd';

// Componenti e costanti (Rimuovi import superflui, mantieni solo PdfDrawer e relativi hook se usati in PresentationPage)
import PdfDrawer from '@/components/pdf-drawer';
import { useClickDrawer } from '@/components/pdf-drawer/hooks';


// Stili
import styles from './index.less';


const AGENT_ID = 'a871ecb2eaba11efb3a10242ac120006'; // Sostituisci con l'ID corretto

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

                    {/* Usa AgentChatContainer e passa agentId */}
                    <div className={styles.chatSection}>
                        <AgentChatContainer agentId={AGENT_ID} /> {/* Passa agentId e RIMUOVI agentMode */}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PresentationPage;