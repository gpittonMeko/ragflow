import React from 'react';
import RunDrawer from './RunDrawer'; // Assicurati che il percorso sia corretto
import styles from './index.less';

const PresentationPage: React.FC = () => {
  return (
    <div className={styles.pageContainer}>
      {/* Header */}
      <header>
        <h1 className={styles.movingGradientLogo}>SGAI</h1>
      </header>

      <div className={styles.mainContent}>
        <div className={styles.presentationContainer}>
          {/* Sezione di presentazione */}
          <div className={styles.presentation}>
            <p>
              SGAI (Sistema di Gestione e Analisi Intelligente) è una piattaforma che utilizza l’intelligenza artificiale 
              per supportare l’analisi e la gestione delle controversie tributarie. Lavoriamo in modo indipendente, senza 
              legami con enti istituzionali, per garantire trasparenza e imparzialità.
            </p>
            <p>
              <strong>
                SGAI è l'assistente legale che avresti sempre desiderato, ma che non hai mai trovato tra gli umani.
              </strong>
            </p>
          </div>

          {/* Iframe per la chat (chat share) */}
          <div className={styles.iframeContainer}>
            <iframe
              src="https://sgailegal.com:8080/chat/share?shared_id=a871ecb2eaba11efb3a10242ac120006&from=agent&auth=lmMmVjNjNhZWExNDExZWY4YTVkMDI0Mm"
              title="Chat Share"
              width="100%"
              height="100%"
              frameBorder="0"
              style={{ border: 'none' }}
            ></iframe>
          </div>

          {/* Componente per la chat integrata (se lo utilizzi) */}
          <RunDrawer />
        </div>
      </div>

      {/* Overlay Work In Progress */}
      <div className={styles.workInProgressOverlay} id="work-in-progress-overlay">
        <div className={styles.overlayContent}>
          <p>Stiamo sviluppando l'applicazione, torneremo a breve!</p>
        </div>
      </div>
    </div>
  );
};

export default PresentationPage;
