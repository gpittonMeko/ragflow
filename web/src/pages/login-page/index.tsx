import React from 'react';
import ChatContainer from '@/components/ChatContainer'; // Assicurati che il percorso sia corretto
import styles from './index.less';

const PresentationPage: React.FC = () => {
  return (
    <div className={styles.pageContainer}>
      {/* Header */}
      <header className={styles.header}>
        <h1 className={styles.movingGradientLogo}>SGAI</h1>
      </header>

      {/* Contenuto principale */}
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

          {/* Integrazione della chat */}
          <div className={styles.chatSection}>
            <ChatContainer controller={new AbortController()} />
          </div>
        </div>
      </div>

      {/* Overlay (Work In Progress) */}
      <div className={styles.workInProgressOverlay} id="work-in-progress-overlay">
        <div className={styles.overlayContent}>
          <p>Stiamo sviluppando l'applicazione, torneremo a breve!</p>
        </div>
      </div>
    </div>
  );
};

export default PresentationPage;
