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
    subtitle: 'Linee difensive e citazioni utili',
    body: `Contesto: controversia tributaria in corso (accertamento, cartella o ricorso).

Chiedi: quali sono le principali linee difensive e i richiami giurisprudenziali per impostare la strategia processuale, con oneri probatori e termini da rispettare.`,
  },
  {
    id: 'modulo-compliance',
    title: 'Compliance',
    subtitle: 'Obblighi, controlli e rischi',
    body: `Contesto: adempimenti fiscali e gestione del rischio per un soggetto economico in Italia.

Chiedi: obblighi ricorrenti, criticità tipiche e controlli consigliati per contenere l’esposizione sanzionatoria.`,
  },
  {
    id: 'modulo-contratti',
    title: 'Contratti e operazioni',
    subtitle: 'Profili fiscali e clausole chiave',
    body: `Contesto: revisione o negoziazione di un contratto con impatti fiscali (prezzo, corrispettivi, split payment, IVA).

Chiedi: quali elementi verificare e quali rischi emergono in dottrina e giurisprudenza.`,
  },
  {
    id: 'modulo-ricerca',
    title: 'Ricerca sentenze',
    subtitle: 'Temi e orientamenti',
    body: `Argomento: [una frase sul tema, es. operazioni inesistenti, PEC, crediti d’imposta].

Chiedi: orientamenti rilevanti (Sezioni Unite o Tribunali amministrativi) e un riepilogo sintetico dei criteri decisori.`,
  },
];

/** Corpi brevi (anteprima compatta); dettaglio si può chiedere in chat. */
export const SHARED_SUGGESTED_PROMPTS: SharedSuggestedPrompt[] = [
  {
    id: 'platts-frode',
    label: 'Platts e frode (op. inesistente)',
    body: `Prezzo carburante sotto Platts e fornitore “cartiera”: il solo scarto dall’indice basta per presunzione di consapevolezza nella frode?

Chiedi criteri giurisprudenziali (CTP, diligenza operatore) in 5 bullet.`,
  },
  {
    id: 'onere-prova-cartiera',
    label: 'Onere della prova (cartiera)',
    body: `Acquisto da cartiera contestato: cosa deve provare l’acquirente su buona fede e detrazione?

Chiedi sintesi Cass. 14102/2024 e 23118/2024 e standard diligenza.`,
  },
  {
    id: 'pec-mittente',
    label: 'PEC mittente non in IPA',
    body: `Cartella via PEC da indirizzo ente non in IPA: la notifica regge?

Chiedi in sintesi Cass. 26682/2024 e 6015/2023 (certezza provenienza, tutela).`,
  },
  {
    id: 'contraddittorio-recupero',
    label: 'Contraddittorio e atto di recupero',
    body: `Atto di recupero su credito R&S già compensato senza contraddittorio: è legittimo?

Chiedi in sintesi SS.UU. 25510/2021 e distinzione automatizzato / discrezionale.`,
  },
  {
    id: 'crediti-non-spettanti',
    label: 'Crediti non spettanti vs inesistenti',
    body: `Compensazione R&S contestata: 100% vs 30% — come distinguere inesistente da non spettante?

Chiedi in sintesi Cass. SU 34419/2023 e criteri pratici.`,
  },
];
