/** Chip corte + testo inviabile alla chat shared (temi giurisprudenza / tributario). */

export interface SharedSuggestedPrompt {
  id: string;
  label: string;
  body: string;
}

/** Moduli “applicazione” in evidenza (card sopra gli scenari guidati) */
export interface SgaiApplicationCard {
  id: string;
  title: string;
  subtitle: string;
  body: string;
}

export const SGAI_APPLICATION_CARDS: SgaiApplicationCard[] = [
  {
    id: 'modulo-contenzioso',
    title: 'Contenzioso',
    subtitle: 'Strategie e difese',
    body: `Contesto: controversia tributaria in corso (accertamento / cartella / ricorso).

Chiedi: quali sono le principali linee difensive e i riferimenti giurisprudenziali utili per impostare la strategia processuale, con attenzione a oneri e termini.`,
  },
  {
    id: 'modulo-compliance',
    title: 'Compliance',
    subtitle: 'Adempimenti e rischi',
    body: `Contesto: adempimenti fiscali e gestione rischi per un soggetto economico in Italia.

Chiedi: quali sono gli obblighi ricorrenti, le criticità tipiche e i controlli consigliati per ridurre esposizione sanzionatoria.`,
  },
  {
    id: 'modulo-contratti',
    title: 'Contratti e operazioni',
    subtitle: 'Clausole e imposte',
    body: `Contesto: revisione o negoziazione di un contratto con impatti fiscali (prezzo, corrispettivi, split payment, IVA).

Chiedi: quali elementi verificare e quali rischi emergono in dottrina e giurisprudenza.`,
  },
  {
    id: 'modulo-ricerca',
    title: 'Ricerca sentenze',
    subtitle: 'Principi e orientamenti',
    body: `Argomento: [descrivi in una frase il tema, es. operazioni inesistenti / PEC / crediti d’imposta].

Chiedi: orientamenti delle Sezioni Unite o dei principali Tribunali amministrativi e un riepilogo sintetico dei criteri decisori.`,
  },
];

export const SHARED_SUGGESTED_PROMPTS: SharedSuggestedPrompt[] = [
  {
    id: 'platts-frode',
    label: 'Platts e frode (op. inesistente)',
    body: `Caso: una societ\u00e0 italiana acquista carburante da un fornitore che l\u2019Agenzia qualifica come \u201ccartiera\u201d; il prezzo \u00e8 inferiore alle quotazioni Platts del periodo. L\u2019Amministratore contesta la detrazione IVA per operazione soggettivamente inesistente e consapevolezza della frode.

Domanda: il differenziale tra prezzo praticato e indice Platts pu\u00f2 fondare da solo la presunzione di partecipazione consapevole alla frode?

Chiedi orientamenti giurisprudenziali (CTP Venezia/Verona, diligenza dell\u2019operatore, elementi integrativi oltre al Platts) e un principio sintetico utile in contenzioso.`,
  },
  {
    id: 'onere-prova-cartiera',
    label: 'Onere della prova (cartiera)',
    body: `Caso: acquisto da fornitore poi identificato come cartiera; contestazione detrazione IVA per operazioni soggettivamente inesistenti.

Domanda: quale onere di verifica grava sull\u2019acquirente per dimostrare buona fede e detrazione?

Chiedi riferimenti a Cass. ord. 14102/2024 e 23118/2024, ruolo dell\u2019Amministratore nella prova della consapevolezza, e standard della diligenza dell\u2019operatore economico medio.`,
  },
  {
    id: 'pec-mittente',
    label: 'PEC mittente non in IPA',
    body: `Caso: cartella di pagamento notificata via PEC da indirizzo dell\u2019ente non presente in INI-PEC / registri pubblici; il contribuente eccepisce nullit\u00e0.

Domanda: la notifica \u00e8 valida se il mittente non risulta nei pubblici registri?

Chiedi Cass. 26682/2024, 6015/2023, condizioni (certezza provenienza, tutela difensiva) e principio sintetico.`,
  },
  {
    id: 'contraddittorio-recupero',
    label: 'Contraddittorio e atto di recupero',
    body: `Caso: atto di recupero su credito d\u2019imposta R&S gi\u00e0 compensato, con sanzioni e interessi, senza previo contraddittorio.

Domanda: pu\u00f2 essere emesso senza contraddittorio preventivo se contiene pretesa impositiva sostanziale?

Chiedi SS.UU. 25510/2021, Cass. 24620/2023 e 27162/2023, DM 24 aprile 2024 (art. 6-bis L. 212/2000), distinzione tra atto meramente automatizzato e atto con valutazione discrezionale.`,
  },
  {
    id: 'crediti-non-spettanti',
    label: 'Crediti non spettanti vs inesistenti',
    body: `Caso: utilizzo in compensazione di credito R&S contestato; Amministrazione qualifica il credito come inesistente e applica sanzione 100%; il contribuente sostiene al pi\u00f9 \u201cnon spettanza\u201d con sanzione 30%.

Domanda: criteri distintivi tra credito non spettante e inesistente e conseguenze sanzionatorie?

Chiedi definizioni, Cass. SU 34419/2023, e come distinguere documentazione carente da assenza totale del presupposto.`,
  },
];
