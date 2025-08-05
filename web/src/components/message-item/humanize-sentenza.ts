// src/utils/humanize-sentenza.ts
const CODICI_CORTE: Record<string, string> = {
  "1°_AGRIGENTO": "V36", "1°_ALESSANDRIA": "U01", "1°_ANCONA": "U79", "1°_AREZZO": "U64",
  "1°_ASCOLI_PICENO": "U80", "1°_ASTI": "U04", "1°_AVELLINO": "V06", "1°_BARI": "V14",
  "1°_BELLUNO": "U36", "1°_BENEVENTO": "V08", "1°_BERGAMO": "U17", "1°_BIELLA": "U14",
  "1°_BOLOGNA": "U55", "1°_BOLZANO": "U33", "1°_BRESCIA": "U18", "1°_BRINDISI": "V16",
  "1°_CAGLIARI": "V53", "1°_CALTANISSETTA": "V38", "1°_CAMPOBASSO": "V02", "1°_CASERTA": "Z55",
  "1°_CATANIA": "V40", "1°_CATANZARO": "V25", "1°_CHIETI": "U97", "1°_COMO": "U19",
  "1°_COSENZA": "V22", "1°_CREMONA": "U22", "1°_CROTONE": "V26", "1°_CUNEO": "U06",
  "1°_ENNA": "V41", "1°_FERRARA": "U56", "1°_FIRENZE": "U65", "1°_FOGGIA": "V17",
  "1°_FORLÌ": "U57", "1°_FROSINONE": "U87", "1°_GENOVA": "U50", "1°_GORIZIA": "U44",
  "1°_GROSSETO": "U67", "1°_IMPERIA": "U51", "1°_ISERNIA": "V04", "1°_L'AQUILA": "U95",
  "1°_LA_SPEZIA": "U53", "1°_LATINA": "U88", "1°_LECCE": "V19", "1°_LECCO": "U20",
  "1°_LIVORNO": "U68", "1°_LODI": "U23", "1°_LUCCA": "U69", "1°_MACERATA": "U83",
  "1°_MANTOVA": "U26", "1°_MASSA_CARRARA": "U70", "1°_MATERA": "V32", "1°_MESSINA": "V43",
  "1°_MILANO": "U24", "1°_MODENA": "U59", "1°_MONZA": "U25", "1°_NAPOLI": "V10",
  "1°_NOVARA": "U09", "1°_NUORO": "V55", "1°_ORISTANO": "V56", "1°_PADOVA": "U37",
  "1°_PALERMO": "V46", "1°_PARMA": "U61", "1°_PAVIA": "U27", "1°_PERUGIA": "U75",
  "1°_PESARO": "U84", "1°_PESCARA": "V00", "1°_PIACENZA": "U60", "1°_PISA": "U71",
  "1°_PISTOIA": "U72", "1°_PORDENONE": "U45", "1°_POTENZA": "V35", "1°_PRATO": "U66",
  "1°_RAGUSA": "V49", "1°_RAVENNA": "U62", "1°_REGGIO_CALABRIA": "V31", "1°_REGGIO_NELL'EMILIA": "U63",
  "1°_RIETI": "U89", "1°_RIMINI": "U58", "1°_ROMA": "U91", "1°_ROVIGO": "U38",
  "1°_SALERNO": "V12", "1°_SASSARI": "V57", "1°_SAVONA": "U54", "1°_SIENA": "U74",
  "1°_SIRACUSA": "V50", "1°_SONDRIO": "U30", "1°_TARANTO": "V20", "1°_TERAMO": "V01",
  "1°_TERNI": "U78", "1°_TREVISO": "U39", "1°_TRIESTE": "U46", "1°_TRENTO": "U35",
  "1°_TORINO": "U13", "1°_TRAPANI": "V52", "1°_UDINE": "U48", "1°_VARESE": "U32",
  "1°_VENEZIA": "U40", "1°_VERBANIA": "U10", "1°_VERCELLI": "U15", "1°_VERONA": "U43",
  "1°_VIBO_VALENTIA": "V28", "1°_VICENZA": "U42", "1°_VITERBO": "U93", "1°_AOSTA": "U16",
  "2°_ABRUZZO": "Z20", "2°_BASILICATA": "Z40", "2°_CALABRIA": "Z37", "2°_CAMPANIA": "Z29",
  "2°_EMILIA_ROMAGNA": "V92", "2°_FRIULI_VENEZIA_GIULIA": "V86", "2°_LAZIO": "Z18",
  "2°_LIGURIA": "V88", "2°_LOMBARDIA": "V70", "2°_MARCHE": "Z11", "2°_MOLISE": "Z24",
  "2°_PIEMONTE": "V63", "2°_PUGLIA": "Z31", "2°_SARDEGNA": "Z50", "2°_SICILIA": "Z46",
  "2°_TOSCANA": "Z01", "2°_TRENTINO_ALTO_ADIGE": "V75", "2°_UMBRIA": "Z09",
  "2°_VALLE_D'AOSTA": "V65", "2°_VENETO": "V81"
};

export function humanizePdfName(fileName: string): string | null {
  const m = fileName.match(/Sentenza_([A-Z0-9]+)_(\d+)_(\d{4})\.pdf/i);
  if (!m) return null;
  const [, codice, numero, anno] = m;
  const corteEntry = Object.entries(CODICI_CORTE).find(([, v]) => v === codice.toUpperCase());
  if (!corteEntry) return null;
  const [corteKey] = corteEntry;                    // es. "2°_CAMPANIA"
  const [grado, ...rest] = corteKey.split('_');     // ["2°","CAMPANIA"]
  const denominazione = rest.join('_').replace(/_/g, ' ');
  const gradoTxt = grado.replace('1°', '1° grado').replace('2°', '2° grado');
  return `Sentenza CGT ${denominazione} – ${gradoTxt} n. ${numero}/${anno}`;
}

// Sostituisce i nomi PDF nel testo markdown
export function replacePdfNamesInText(
  text: string,
  resolver: (name: string) => string | null
): string {
  return text.replace(/Sentenza_[A-Z0-9]+_\d+_\d{4}\.pdf/gi, (m) => resolver(m) ?? m);
}
