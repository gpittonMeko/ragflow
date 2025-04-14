import React, { memo, useRef, useState } from 'react';

// Stili
import styles from './index.less';

const PresentationPage: React.FC = () => {
  const controllerRef = useRef(new AbortController());
  const [theme, setTheme] = useState<'light' | 'dark'>('dark'); // Stato per il tema (inizialmente scuro)

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'dark' ? 'light' : 'dark'));
    // Qui potresti aggiungere la logica per cambiare dinamicamente i fogli di stile
    // o utilizzare un sistema di gestione dei temi più complesso.
    // Per ora, cambieremo semplicemente il colore di sfondo del body.
    document.body.classList.toggle('light-theme');
  };

  return (
    <div className={`${styles.pageContainer} ${theme === 'light' ? 'light-theme' : ''}`}>
      <button onClick={toggleTheme} className={styles.themeToggleButton}>
        {theme === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
      </button>
      <div className={styles.heroSection}>
        <h1 className={styles.heroTitle}>SGAI: La tua Intelligenza Artificiale per la Commercialistica Tributaria</h1>
        <p className={styles.heroSubtitle}>Semplifichiamo l'analisi e la gestione delle controversie tributarie con la potenza dell'IA.</p>
      </div>

      <div className={styles.featuresSection}>
        <div className={styles.featureCard}>
          <img src="https://via.placeholder.com/80/cccccc/ffffff?Text=Analisi" alt="Analisi Intelligente" className={styles.featureImage} />
          <h3>Analisi Intelligente</h3>
          <p>Sfrutta l'IA per analizzare rapidamente accertamenti, normative e giurisprudenza.</p>
        </div>
        <div className={styles.featureCard}>
          <img src="https://via.placeholder.com/80/cccccc/ffffff?Text=Gestione" alt="Gestione Efficiente" className={styles.featureImage} />
          <h3>Gestione Efficiente</h3>
          <p>Ottimizza il tuo flusso di lavoro e prendi decisioni più informate.</p>
        </div>
        <div className={styles.featureCard}>
          <img src="https://via.placeholder.com/80/cccccc/ffffff?Text=Indipendenza" alt="Indipendenza e Imparzialità" className={styles.featureImage} />
          <h3>Indipendenza e Imparzialità</h3>
          <p>Lavoriamo senza legami istituzionali per garantire la massima trasparenza.</p>
        </div>
      </div>

      {/* ... (resto del contenuto della pagina) ... */}

      <div className={styles.aboutUsSection}>
        <h2>Chi Siamo</h2>
        <p className={styles.aboutUsIntro}>Un team di professionisti dedicati all'innovazione nel settore della commercialistica tributaria.</p>
        <div className={styles.teamCards}>
          <div className={styles.teamCard}>
            <img src="https://via.placeholder.com/100/bbbbbb/ffffff?Text=Marco" alt="Marco Spadotto" className={styles.teamImage} />
            <h3>Marco Spadotto</h3>
            <p className={styles.teamRole}>Commercialista Tributario</p>
            <p className={styles.teamDescription}>Lunga esperienza nella consulenza fiscale e nella gestione delle pratiche contabili.</p>
          </div>
          <div className={styles.teamCard}>
            <img src="https://via.placeholder.com/100/bbbbbb/ffffff?Text=Giovanni" alt="Giovanni Pitton" className={styles.teamImage} />
            <h3>Giovanni Pitton</h3>
            <p className={styles.teamRole}>CTO</p>
            <p className={styles.teamDescription}>Esperto nello sviluppo di soluzioni software innovative e nell'applicazione dell'intelligenza artificiale.</p>
          </div>
          <div className={styles.teamCard}>
            <img src="https://via.placeholder.com/100/bbbbbb/ffffff?Text=Davide" alt="Davide Cal" className={styles.teamImage} />
            <h3>Davide Cal</h3>
            <p className={styles.teamRole}>Amministratore</p>
            <p className={styles.teamDescription}>Solida esperienza nella gestione aziendale e nella definizione di strategie di crescita.</p>
          </div>
        </div>
        <h3>La Nostra Missione</h3>
        <p className={styles.missionStatement}>Rendere più efficienti e accessibili le attività della commercialistica tributaria attraverso l'intelligenza artificiale, fornendo strumenti innovativi che semplifichino il lavoro dei professionisti e migliorino la gestione per i clienti.</p>
      </div>

      <div className={styles.iframeSection}>
        <iframe
          src="https://sgailegal.it/chat/share?shared_id=a871ecb2eaba11efb3a10242ac120006&from=agent&auth=lmMmVjNjNhZWExNDExZWY4YTVkMDI0Mm"
          style={{ width: '100%', height: '100%', minHeight: '600px' }}
          frameBorder="0"
        />
      </div>

      <div className={styles.disclaimerSection}>
        <p><strong>Disclaimer:</strong></p>
        <p>Si prega di notare che SGAI è un sistema basato sull'intelligenza artificiale. Sebbene ci impegniamo a fornire informazioni accurate e utili, il modello può occasionalmente commettere errori o produrre informazioni non corrette. È fondamentale verificare sempre le informazioni fornite con fonti affidabili e consultare professionisti qualificati per decisioni importanti.</p>
      </div>
    </div>
  );
};

export default PresentationPage;