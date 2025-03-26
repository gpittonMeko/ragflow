import React, { memo, useRef } from 'react';
import AgentChatContainer from '@/components/agent-chat-container/AgentChatContainer'; // Importa il nuovo componente

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

                    {/* Inserisci qui l'iframe */}
                    <div className={styles.iframeSection}>
                        <iframe
                            src="http://sgailegal.it/chat/share?shared_id=a871ecb2eaba11efb3a10242ac120006&from=agent&auth=lmMmVjNjNhZWExNDExZWY4YTVkMDI0Mm"
                            style={{ width: '100%', height: '100%', minHeight: '600px' }}
                            frameBorder="0"
                        />
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