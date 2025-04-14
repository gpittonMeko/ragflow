import React, { memo, useRef } from 'react';

// Stili
import styles from './index.less';

const PresentationPage: React.FC = () => {
  const controllerRef = useRef(new AbortController());

  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}>
        {/* Rimossa la riga con il titolo SGAI */}
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
              Il nostro obiettivo è fornire uno strumento potente e intuitivo per semplificare la
              comprensione di accertamenti, normative e giurisprudenza, aiutando i professionisti a
              prendere decisioni più informate e a gestire il proprio lavoro in modo più efficiente.
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
              src="https://sgailegal.it/chat/share?shared_id=a871ecb2eaba11efb3a10242ac120006&from=agent&auth=lmMmVjNjNhZWExNDExZWY4YTVkMDI0Mm"
              style={{ width: '100%', height: '100%', minHeight: '600px' }}
              frameBorder="0"
            />
          </div>

          {/* Sezione Chi Siamo */}
          <div className={styles.aboutUsSection}>
            <h3>Chi Siamo</h3>
            <p>Siamo un team di professionisti con competenze complementari, uniti dalla volontà di innovare il settore della commercialistica tributaria:</p>
            <ul>
              <li><strong>Marco Spadotto:</strong> Commercialista Tributario con una lunga esperienza nella consulenza fiscale e nella gestione delle pratiche contabili.</li>
              <li><strong>Giovanni Pitton:</strong> CTO (Chief Technology Officer) esperto nello sviluppo di soluzioni software innovative e nell'applicazione dell'intelligenza artificiale.</li>
              <li><strong>Davide Cal:</strong> Amministratore con una solida esperienza nella gestione aziendale e nella definizione di strategie di crescita.</li>
            </ul>
            <h4>Missione</h4>
            <p>La nostra missione è rendere più efficienti e accessibili le attività della commercialistica tributaria attraverso l'intelligenza artificiale, fornendo strumenti innovativi che semplifichino il lavoro dei professionisti e migliorino la gestione per i clienti.</p>
          </div>

          {/* Disclaimer */}
          <div className={styles.disclaimerSection}>
            <p><strong>Disclaimer:</strong></p>
            <p>Si prega di notare che SGAI è un sistema basato sull'intelligenza artificiale. Sebbene ci impegniamo a fornire informazioni accurate e utili, il modello può occasionalmente commettere errori o produrre informazioni non corrette. È fondamentale verificare sempre le informazioni fornite con fonti affidabili e consultare professionisti qualificati per decisioni importanti.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PresentationPage;