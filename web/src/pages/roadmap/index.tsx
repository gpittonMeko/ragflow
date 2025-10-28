import { CheckCircle, Clock, Lightbulb } from 'lucide-react';
import React from 'react';
import { useNavigate } from 'umi';
import styles from './index.less';

interface RoadmapItem {
  title: string;
  description: string;
  status: 'completed' | 'in-progress' | 'planned';
  quarter: string;
}

const roadmapData: RoadmapItem[] = [
  {
    title: 'Database Giustizia Tributaria - 630.000+ Sentenze',
    description:
      '✅ Completato: Integrato database completo con 631.263 sentenze della giustizia tributaria (Banca Dati MEF). Copertura completa di commissioni tributarie, TAR e giurisdizioni regionali.',
    status: 'completed',
    quarter: 'Q3 2025',
  },
  {
    title: 'Database Cassazione e Massimari',
    description:
      '✅ Completato: Integrati 2.368 sentenze della Corte di Cassazione Sezione Quinta, 8 Massimari della Cassazione e 154 Massimari delle Corti di Merito. Base giurisprudenziale solida per analisi normative.',
    status: 'completed',
    quarter: 'Q3 2025',
  },
  {
    title: 'Assistente AI per Interpretazione Documenti',
    description:
      '✅ Completato: Assistente IA completamente funzionante che aiuta ad interpretare documenti giuridici, rispondere a domande complesse e fornire analisi contestuali basate sulla conoscenza integrata.',
    status: 'completed',
    quarter: 'Q3 2025',
  },
  {
    title: 'Database Normativa e Prassi Fiscale',
    description:
      '✅ Completato: Integrati 9.136 documenti di Prassi Agenzia delle Entrate, 135 documenti di normativa tributaria, 22 Informazioni Tariffarie Vincolanti (ITV) e Note Esplicative. Sistema completo per consulenza fiscale.',
    status: 'completed',
    quarter: 'Q3 2025',
  },
  {
    title: 'Espansione Database Sentenze',
    description:
      'Aggiunta di 50.000+ nuove sentenze dalla Corte di Cassazione, TAR e Tribunali amministrativi. Copertura completa 2020-2024.',
    status: 'in-progress',
    quarter: 'Q4 2025',
  },
  {
    title: 'Database Storico Sentenze',
    description:
      'Integrazione archivio storico sentenze dal 1950 al 2019. Ricerca su 70+ anni di giurisprudenza italiana per analisi evolutiva del diritto.',
    status: 'in-progress',
    quarter: 'Q4 2025',
  },
  {
    title: 'Applicazione Mobile Android',
    description:
      'App nativa Android per consultare SGAI in mobilità. Ricerca vocale, sincronizzazione cloud e modalità offline.',
    status: 'planned',
    quarter: 'Q1 2026',
  },
  {
    title: 'Installazione On-Premise',
    description:
      'Versione enterprise installabile nei server dello Studio. Privacy totale, personalizzazione completa, nessun dato su cloud esterno.',
    status: 'planned',
    quarter: 'Q1 2026',
  },
  {
    title: 'Integrazione Normativa Europea',
    description:
      'Database completo di normative UE, CEDU e direttive comunitarie con traduzione automatica e cross-reference.',
    status: 'planned',
    quarter: 'Q2 2026',
  },
  {
    title: 'AI Assistant per Redazione Atti',
    description:
      'Assistente IA specializzato nella stesura di atti giudiziari: ricorsi, memorie, controdeduzioni con suggerimenti di giurisprudenza pertinente.',
    status: 'planned',
    quarter: 'Q2 2026',
  },
  {
    title: 'Analisi Predittiva Esiti',
    description:
      "Sistema di machine learning per prevedere l'esito di contenziosi basandosi su precedenti giurisprudenziali e caratteristiche del caso.",
    status: 'planned',
    quarter: 'Q3 2026',
  },
  {
    title: 'Applicazione iOS',
    description:
      'Estensione della mobile experience su iPhone e iPad con supporto Apple Pencil per annotazioni.',
    status: 'planned',
    quarter: 'Q3 2026',
  },
  {
    title: 'Ricerca Semantica Avanzata',
    description:
      'Motore di ricerca potenziato con comprensione del contesto giuridico, sinonimi legali e ricerca per concetti invece che per parole chiave.',
    status: 'planned',
    quarter: 'Q4 2026',
  },
];

const RoadmapPage: React.FC = () => {
  const navigate = useNavigate();

  const getStatusIcon = (status: RoadmapItem['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className={styles.iconCompleted} />;
      case 'in-progress':
        return <Clock className={styles.iconInProgress} />;
      case 'planned':
        return <Lightbulb className={styles.iconPlanned} />;
    }
  };

  const getStatusLabel = (status: RoadmapItem['status']) => {
    switch (status) {
      case 'completed':
        return 'Completato';
      case 'in-progress':
        return 'In Sviluppo';
      case 'planned':
        return 'Pianificato';
    }
  };

  return (
    <div className={styles.roadmapContainer}>
      <button onClick={() => navigate('/')} className={styles.backButton}>
        ← Torna alla Home
      </button>

      <div className={styles.header}>
        <h1>Roadmap SGAI</h1>
        <p className={styles.subtitle}>
          Il futuro dell&apos;intelligenza artificiale per l&apos;ambito legale
        </p>
      </div>

      <div className={styles.timeline}>
        {roadmapData.map((item, index) => (
          <div key={index} className={styles.roadmapItem}>
            <div className={styles.itemHeader}>
              <div className={styles.statusBadge}>
                {getStatusIcon(item.status)}
                <span className={styles[`status-${item.status}`]}>
                  {getStatusLabel(item.status)}
                </span>
              </div>
              <span className={styles.quarter}>{item.quarter}</span>
            </div>

            <h3 className={styles.itemTitle}>{item.title}</h3>
            <p className={styles.itemDescription}>{item.description}</p>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <p>
          <strong>Nota:</strong> Le tempistiche sono indicative e soggette a
          variazioni in base alle esigenze degli utenti e priorità di sviluppo.
        </p>
        <p>
          Hai suggerimenti o richieste? Contattaci tramite il bottone WhatsApp!
        </p>
      </div>
    </div>
  );
};

export default RoadmapPage;
