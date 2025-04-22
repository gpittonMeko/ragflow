import os
import json
import PyPDF2
# import openai # Non necessario per la categorizzazione basata su keyword
import re
# from openai import OpenAI # Non necessario per la categorizzazione basata su keyword
from typing import List, Dict, Optional, Tuple
import time
# from tqdm import tqdm # Puoi aggiungerlo per visualizzare l'avanzamento (richiede installazione: pip install tqdm)
import concurrent.futures # Import per la gestione dei thread/processi
# import threading # Mantenuto per la struttura originale, ma non usato direttamente nel Executor

# =======================================================
# CONFIGURAZIONE: API e modello (Non necessari per la categorizzazione basata su keyword)
# =======================================================
# Le seguenti righe non sono necessarie per la categorizzazione basata solo su keyword.
# Se in futuro volessi integrare un modello OpenAI, dovresti riattivarle e configurare la chiave API.
# openai.api_key = os.environ.get("OPEN_AI_API")
# MODEL_NAME = "gpt-4o-mini-2024-07-18"

# Variabile globale per memorizzare i metadati dell'ultima sentenza elaborata (thread-safe)
# last_processed_metadata = None
# metadata_lock = threading.Lock()

# Variabile per controllare se l'elaborazione è in corso
# processing_active = True

# =======================================================
# DEFINIZIONE DELLE CATEGORIE FISCALI (Provided by the user)
# =======================================================

# Gruppi di categorie fiscali organizzati in modo gerarchico
taxCategoryGroups = {
  "IMPOSTE DIRETTE": {
    "A010": {
      "name": "Irpef",
      "primaryKeywords": ["irpef", "imposta sul reddito delle persone fisiche"],
      "keywords": ["reddito persone fisiche", "dichiarazione redditi", "730", "modello unico", "detrazioni", "deduzioni"]
    },
    "A020": {
      "name": "Ires (ex Irpeg)",
      "primaryKeywords": ["ires", "irpeg", "imposta sul reddito delle società"],
      "keywords": ["reddito societario", "tassazione società", "utili aziendali"]
    },
    "A030": {
      "name": "Ilor",
      "primaryKeywords": ["ilor", "imposta locale sui redditi"],
      "keywords": ["imposta locale"]
    },
    "C010": {
      "name": "Irap",
      "primaryKeywords": ["irap", "imposta regionale sulle attività produttive"],
      "keywords": ["attività produttive", "valore della produzione", "produzione netta"]
    }
  },
  "IMPOSTE INDIRETTE": {
    "B010": {
      "name": "Iva",
      "primaryKeywords": ["iva", "imposta sul valore aggiunto"],
      "keywords": ["detrazione iva", "credito iva", "rimborso iva", "operazioni imponibili", "fatturazione"]
    },
    "B020": {
      "name": "Registro",
      "primaryKeywords": ["imposta di registro", "registro"],
      "keywords": ["atto di registro", "registrazione", "tassazione atti"]
    },
    "B030": {
      "name": "Ipotecarie e catastali",
      "primaryKeywords": ["ipotecarie e catastali", "ipotecaria", "imposta ipotecaria", "catastale"],
      "keywords": ["catasto", "ipoteca", "trascrizione"]
    },
    "B040": {
      "name": "Successioni e donazioni",
      "primaryKeywords": ["successioni", "donazioni", "imposta sulle successioni"],
      "keywords": ["eredità", "lascito", "testamento", "asse ereditario"]
    },
    "B050": {
      "name": "Bollo",
      "primaryKeywords": ["bollo", "imposta di bollo"],
      "keywords": ["marca da bollo", "contrassegno", "carta bollata"]
    }
  },
  "TRIBUTI LOCALI": {
    "C020": {
      "name": "Imu ex Ici",
      "primaryKeywords": ["imu", "ici", "imposta municipale", "imposta comunale sugli immobili"],
      "keywords": ["tributo comunale", "immobili", "fabbricati", "rendita catastale"]
    },
    "C030": {
      "name": "Pubblicità e pubbliche affissioni",
      "primaryKeywords": ["imposta sulla pubblicità", "pubbliche affissioni"],
      "keywords": ["affissioni", "manifesti", "insegne"]
    },
    "C040": {
      "name": "Tarsu",
      "primaryKeywords": ["tarsu", "tassa per lo smaltimento dei rifiuti solidi urbani", "tari"],
      "keywords": ["tassa rifiuti", "smaltimento", "rifiuti urbani"]
    },
    "C050": {
      "name": "Cosap",
      "primaryKeywords": ["cosap", "canone occupazione spazi"],
      "keywords": ["occupazione suolo pubblico", "spazi pubblici"]
    },
    "C060": {
      "name": "Tosap",
      "primaryKeywords": ["tosap", "tassa per l'occupazione di spazi ed aree pubbliche"],
      "keywords": ["occupazione", "suolo pubblico", "aree pubbliche"]
    }
  },
  "CONTENZIOSO E RISCOSSIONE": {
    "D010": {
      "name": "Agevolazioni",
      "primaryKeywords": ["agevolazioni", "agevolazione fiscale", "agevolazioni tributarie"],
      "keywords": ["benefici fiscali", "esenzioni", "detassazione", "credito d'imposta"]
    },
    "D020": {
      "name": "Riscossione",
      "primaryKeywords": ["riscossione", "cartella di pagamento", "ingiunzione di pagamento", "cartelle", "iscrizione ipotecaria"],
      "keywords": ["ruolo", "esattoria", "agente della riscossione", "agenzia entrate riscossione", "dilazione", "intimazione"]
    },
    "D030": {
      "name": "Rimborsi",
      "primaryKeywords": ["rimborso", "rimborsi"],
      "keywords": ["restituzione", "credito", "indebito", "somme non dovute"]
    },
    "D040": {
      "name": "Accertamento imposte",
      "primaryKeywords": ["accertamento", "avviso di accertamento"],
      "keywords": ["controllo", "rettifica", "verifica", "indagini", "presunzioni"]
    },
    "D050": {
      "name": "Violazioni e sanzioni",
      "primaryKeywords": ["sanzioni", "sanzione tributaria", "violazione"],
      "keywords": ["penalità", "illecito", "infrazione", "irregolarità", "tardivo"]
    },
    "D060": {
      "name": "Contenzioso",
      "primaryKeywords": ["contenzioso tributario", "contenzioso fiscale", "ricorso tributario", "commissione tributaria"],
      "keywords": ["impugnazione", "giudizio", "processo", "sentenza", "appello"]
    },
    "D070": {
      "name": "Condono",
      "primaryKeywords": ["condono", "condono fiscale", "sanatoria"],
      "keywords": ["definizione agevolata", "pace fiscale", "rottamazione"]
    },
    "D080": {
      "name": "Rapporti con l'AF",
      "primaryKeywords": ["rapporti con l'amministrazione finanziaria", "agenzia delle entrate"],
      "keywords": ["amministrazione finanziaria", "ufficio imposte", "rapporti con il fisco"]
    }
  },
  "IMPOSTE SPECIALI": {
    "E010": {
      "name": "Accise armonizzate - Prodotti energetici ed elettricità",
      "primaryKeywords": ["accise", "prodotti energetici", "elettricità", "accisa sui prodotti energetici"],
      "keywords": ["energia", "carburanti", "combustibili"]
    },
    "E020": {
      "name": "Accise armonizzate - Alcole",
      "primaryKeywords": ["accise alcole", "alcole", "alcolici", "accisa sugli alcolici"],
      "keywords": ["bevande alcoliche", "spiriti", "liquori"]
    },
    "E030": {
      "name": "Accise non armonizzate",
      "primaryKeywords": ["accise non armonizzate"],
      "keywords": ["accise", "non armonizzate"]
    },
    "F010": {
      "name": "Dogane",
      "primaryKeywords": ["dogane", "doganale", "dazio", "dazi doganali"],
      "keywords": ["importazione", "esportazione", "tassazione doganale", "frontiera"]
    },
    "B060": {
      "name": "Concessioni governative",
      "primaryKeywords": ["concessioni governative", "tassa sulle concessioni governative"],
      "keywords": ["concessioni", "governo", "licenze"]
    },
    "B070": {
      "name": "Imposta sulle assicurazioni",
      "primaryKeywords": ["imposta sulle assicurazioni"],
      "keywords": ["polizze", "assicurazione", "premi"]
    },
    "B080": {
      "name": "Tassa sui contratti di borsa",
      "primaryKeywords": ["contratti di borsa", "tassa sui contratti di borsa"],
      "keywords": ["borsa", "contratti", "mercato azionario"]
    },
    "B090": {
      "name": "Intrattenimenti",
      "primaryKeywords": ["intrattenimenti", "imposta sugli intrattenimenti"],
      "keywords": ["spettacoli", "eventi", "divertimento"]
    },
    "B100": {
      "name": "Tasse automobilistiche",
      "primaryKeywords": ["tasse automobilistiche", "bollo auto", "tassa automobilistica"],
      "keywords": ["automobili", "veicoli", "bollo"]
    },
    "B110": {
      "name": "Radiodiffusioni",
      "primaryKeywords": ["radiodiffusioni", "canone rai"],
      "keywords": ["radio", "televisione", "canone"]
    },
    "B130": {
      "name": "Imposta erariale di trascrizione",
      "primaryKeywords": ["erariale di trascrizione", "imposta erariale"],
      "keywords": ["trascrizione", "registro", "veicoli"]
    },
    "B140": {
      "name": "Diritti e tributi indiretti vari",
      "primaryKeywords": ["tributi indiretti", "diritti indiretti"],
      "keywords": ["tributi", "diritti", "imposte indirette"]
    }
  },
  "CATASTO E ALTRI TRIBUTI": {
    "G010": {
      "name": "Demanio",
      "primaryKeywords": ["demanio", "demaniale"],
      "keywords": ["beni demaniali", "patrimonio pubblico"]
    },
    "H010": {
      "name": "Catasto",
      "primaryKeywords": ["catasto", "catastale"],
      "keywords": ["rendita", "accertamento catastale", "visura", "mappale", "particella"]
    },
    "H020": {
      "name": "Servizi estimativi (OMI)",
      "primaryKeywords": ["servizi estimativi", "omi", "osservatorio mercato immobiliare"],
      "keywords": ["stima", "valutazione", "immobili"]
    },
    "H030": {
      "name": "Pubblicità immobiliare",
      "primaryKeywords": ["pubblicità immobiliare"],
      "keywords": ["immobili", "pubblicazione", "trascrizione"]
    },
    "C070": {
      "name": "Invim",
      "primaryKeywords": ["invim", "imposta sull'incremento di valore degli immobili"],
      "keywords": ["incremento valore", "immobili", "valore"]
    },
    "C080": {
      "name": "Iciap",
      "primaryKeywords": ["iciap", "imposta comunale per l'esercizio di imprese"],
      "keywords": ["comunale", "esercizio imprese"]
    },
    "C090": {
      "name": "Tributi locali vari",
      "primaryKeywords": ["tributi locali", "tributo locale"],
      "keywords": ["locale", "comune", "provincia", "regione"]
    }
  }
}

# =======================================================
# FUNZIONI DI BASE PER L'ESTRAZIONE DEL TESTO
# =======================================================

def estrai_testo_parziale_da_pdf(percorso_pdf: str, pagine_iniziali: int = 2, pagine_finali: int = 1) -> str:
    """
    Estrae solo le prime 'pagine_iniziali' e le ultime 'pagine_finali' dal PDF,
    per ridurre il numero di token inviati al modello.
    Se il PDF ha meno pagine, prende tutte quelle disponibili.
    """
    # print(f"[LOG] Estrazione testo parziale da: {percorso_pdf}") # Evita stampe eccessive per molti file
    try:
        with open(percorso_pdf, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            num_pages = len(reader.pages)

            testo_estratto = []

            # Estrae le pagine iniziali
            fine_iniziali = min(pagine_iniziali, num_pages)
            for i in range(fine_iniziali):
                txt = reader.pages[i].extract_text() or ""
                testo_estratto.append(txt)

            # Estrae le pagine finali (evitando duplicati)
            start_finali = max(0, num_pages - pagine_finali)
            for i in range(start_finali, num_pages):
                if i >= fine_iniziali:
                    txt = reader.pages[i].extract_text() or ""
                    testo_estratto.append(txt)

        return "\n".join(testo_estratto)
    except Exception as e:
        print(f"[LOG] Errore nell'estrazione del testo parziale da {percorso_pdf}: {e}")
        return ""


def estrai_testo_completo_da_pdf(percorso_pdf: str) -> str:
    """
    Estrae tutto il testo da un file PDF.
    """
    # print(f"[LOG] Estrazione testo completo da: {percorso_pdf}") # Evita stampe eccessive per molti file
    testo_completo = ""
    try:
        with open(percorso_pdf, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                testo_completo += page.extract_text() + "\n"
    except Exception as e:
        print(f"[LOG] Errore nell'estrazione del testo completo da {percorso_pdf}: {e}")
    return testo_completo

def suddividi_testo_in_chunk(testo: str, max_caratteri: int = 1500) -> List[str]:
    """
    Suddivide il testo in blocchi (chunk) di dimensione massima 'max_caratteri',
    per evitare di superare il limite di token per ogni chiamata (non usato con categorizzazione keyword).
    """
    parole = testo.split()
    chunks = []
    chunk_corrente = []
    lung_corr = 0

    for parola in parole:
        lung_p = len(parola) + 1  # +1 per lo spazio
        if lung_corr + lung_p <= max_caratteri:
            chunk_corrente.append(parola)
            lung_corr += lung_p
        else:
            chunks.append(" ".join(chunk_corrente))
            chunk_corrente = [parola]
            lung_corr = lung_p

    if chunk_corrente:
        chunks.append(" ".join(chunk_corrente))

    return chunks

# =======================================================
# FUNZIONI PER LA CATEGORIZZAZIONE TRIBUTARIA
# =======================================================

def preprocessText(text: str) -> str:
    """
    Preprocessa il testo della sentenza per l'analisi
    """
    # Converti in minuscolo
    processed_text = text.lower()

    # Rimuovi caratteri speciali ma mantieni spazi e punteggiatura essenziale
    processed_text = re.sub(r'[^\w\s.,;:()"]', ' ', processed_text)

    # Normalizza gli spazi multipli
    processed_text = re.sub(r'\s+', ' ', processed_text)

    return processed_text

def isRiscossioneDocument(text: str) -> bool:
    """
    Verifica se una sentenza riguarda principalmente la riscossione
    """
    riscossione_terms = [
        "riscossione",
        "cartella di pagamento",
        "cartelle di pagamento",
        "iscrizione ipotecaria",
        "intimazione di pagamento",
        "ruolo esattoriale",
        "agente della riscossione"
    ]

    # Controlla se almeno 2 termini relativi alla riscossione sono presenti
    count = 0
    for term in riscossione_terms:
        if term in text:
            count += 1
            if count >= 2:
                return True

    # Oppure se "riscossione" appare più di 3 volte
    riscossione_matches = re.findall(r'riscossione', text)
    if riscossione_matches and len(riscossione_matches) > 3:
        return True

    return False

def countKeywordMatches(text: str, keywords: List[str]) -> int:
    """
    Conta le occorrenze di una lista di parole chiave nel testo
    """
    count = 0

    for keyword in keywords:
        # Utilizza un'espressione regolare con word boundary per trovare corrispondenze esatte
        regex = re.compile(r'\b' + re.escape(keyword) + r'\b', re.IGNORECASE)
        matches = regex.findall(text)
        count += len(matches)

    return count

def adjustScoreForPosition(text: str, keywords: List[str], baseScore: int) -> int:
    """
    Aumenta il punteggio se le parole chiave appaiono nelle parti importanti della sentenza
    """
    adjusted_score = baseScore

    # Estrai l'inizio della sentenza (circa 20% del testo)
    introduction_threshold = int(len(text) * 0.2)
    introduction = text[:introduction_threshold]

    # Cerca di estrarre il dispositivo/conclusioni della sentenza
    dispositive_match = re.search(r'(?:PQM|P\.Q\.M\.|per questi motivi|il collegio|la commissione).*?(?:decide|stabilisce|accoglie|rigetta|dichiara)', text, re.IGNORECASE | re.DOTALL)
    dispositive = dispositive_match.group(0) if dispositive_match else text[int(len(text) * 0.8):]

    # Controlla se le parole chiave sono presenti nell'introduzione (peso maggiore)
    for keyword in keywords:
        regex = re.compile(r'\b' + re.escape(keyword) + r'\b', re.IGNORECASE)

        if regex.search(introduction):
            adjusted_score += 2  # Bonus per parole chiave nell'introduzione

        if regex.search(dispositive):
            adjusted_score += 3  # Bonus maggiore per parole chiave nel dispositivo

    return adjusted_score

def analyzeKeywordContext(text: str, keyword: str, contextSize: int = 100) -> float:
    """
    Analizza il contesto in cui appaiono le parole chiave.
    Ritorna un punteggio basato sulla rilevanza del contesto.
    """
    score = 0.0
    regex = re.compile(r'\b' + re.escape(keyword) + r'\b', re.IGNORECASE)

    for match in regex.finditer(text):
        start = max(0, match.start() - contextSize)
        end = min(len(text), match.end() + contextSize)
        context = text[start:end]

        # Esempi di pattern contestuali rilevanti (possono essere affinati)
        if re.search(r'ricorso\s.*?contro\s.*?' + re.escape(keyword), context, re.IGNORECASE):
            score += 1.5 # Trovato nel contesto di un ricorso contro quella materia
        if re.search(re.escape(keyword) + r'.*?(?:oggetto|materia|relativo)', context, re.IGNORECASE):
             score += 1.0 # Trovato vicino a "oggetto", "materia", "relativo"
        if re.search(r'(?:applicazione|disciplina|versamento|liquidazione)\s.*?' + re.escape(keyword), context, re.IGNORECASE):
             score += 0.8 # Trovato nel contesto di applicazione/disciplina/versamento/liquidazione
        if re.search(re.escape(keyword) + r'.*?(?:legge|articolo|comma|decreto)', context, re.IGNORECASE):
             score += 0.7 # Trovato vicino a riferimenti normativi


    return score * 0.5 # Riduci l'impatto del punteggio di contesto rispetto alle occorrenze dirette


def analyzeDispositive(text: str) -> Optional[Dict]:
    """
    Estrae informazioni dal dispositivo (PQM) della sentenza, se presente.
    """
    # Cerca il dispositivo - pattern comune PQM o simili fino alla decisione
    dispositive_match = re.search(r'(?:PQM|P\.Q\.M\.|per questi motivi|il collegio|la commissione).*?(?:decide|stabilisce|accoglie|rigetta|dichiara)', text, re.IGNORECASE | re.DOTALL)

    if not dispositive_match:
        return None

    dispositive_text = dispositive_match.group(0)
    result = {
        "text": dispositive_text,
        "outcome": None,
        "taxReferences": []
    }

    # Determina l'esito
    if re.search(r'accoglie', dispositive_text, re.IGNORECASE):
        result["outcome"] = "accolto"
    elif re.search(r'rigetta', dispositive_text, re.IGNORECASE):
        result["outcome"] = "rigettato"
    elif re.search(r'parzialmente', dispositive_text, re.IGNORECASE):
        result["outcome"] = "parzialmente accolto"
    else:
        result["outcome"] = "altro"

    # Individua riferimenti a imposte nel dispositivo
    for group_name, categories in taxCategoryGroups.items():
        for code, category in categories.items():
            for keyword in category.get("primaryKeywords", []) + category.get("keywords", []):
                if re.search(r'\b' + re.escape(keyword) + r'\b', dispositive_text, re.IGNORECASE):
                    result["taxReferences"].append({
                        "code": code,
                        "name": category["name"],
                        "keyword": keyword
                    })

    return result


def applySpecialCaseRules(text: str, scores: Dict) -> Dict:
    """
    Implementa regole speciali per casi particolari di categorizzazione
    """
    enhanced_scores = scores.copy()

    # Regola speciale per IMU/ICI
    imu_ici_matches = re.findall(r'\b(imu|ici)\b', text, re.IGNORECASE)
    if imu_ici_matches and len(imu_ici_matches) > 3:
        enhanced_scores["C020"] = enhanced_scores.get("C020", {"code": "C020", "name": "Imu ex Ici", "score": 0})
        enhanced_scores["C020"]["score"] = max(enhanced_scores["C020"].get("score", 0), 8)

    # Regola speciale per IRPEF
    irpef_matches = re.findall(r'\birpef\b', text, re.IGNORECASE)
    if irpef_matches and len(irpef_matches) > 3:
        enhanced_scores["A010"] = enhanced_scores.get("A010", {"code": "A010", "name": "Irpef", "score": 0})
        enhanced_scores["A010"]["score"] = max(enhanced_scores["A010"].get("score", 0), 7)

    # Regola speciale per IVA
    iva_matches = re.findall(r'\biva\b', text, re.IGNORECASE)
    if iva_matches and len(iva_matches) > 5:
        enhanced_scores["B010"] = enhanced_scores.get("B010", {"code": "B010", "name": "Iva", "score": 0})
        enhanced_scores["B010"]["score"] = max(enhanced_scores["B010"].get("score", 0), 7)

    # Verifica se è un accertamento
    accertamento_matches = re.findall(r'avviso di accertamento|atto di accertamento|rettifica|controllo formale', text, re.IGNORECASE)
    if accertamento_matches and len(re.findall(r'avviso di accertamento|atto di accertamento', text, re.IGNORECASE)) > 2:
        enhanced_scores["D040"] = enhanced_scores.get("D040", {"code": "D040", "name": "Accertamento imposte", "score": 0})
        enhanced_scores["D040"]["score"] = max(enhanced_scores["D040"].get("score", 0), 6)

    # Verifica per sanzioni
    sanzioni_matches = re.findall(r'sanzioni|sanzione amministrativa|penalit|violazione|irregolarità|illecito', text, re.IGNORECASE)
    if sanzioni_matches and len(sanzioni_matches) > 5:
        enhanced_scores["D050"] = enhanced_scores.get("D050", {"code": "D050", "name": "Violazioni e sanzioni", "score": 0})
        enhanced_scores["D050"]["score"] = max(enhanced_scores["D050"].get("score", 0), 6)

    # Verifica per riscossione (applicazione più sfumata rispetto all'override iniziale)
    riscossione_matches = re.findall(r'riscossione|cartella di pagamento|ruolo esattoriale', text, re.IGNORECASE)
    if riscossione_matches and len(riscossione_matches) > 3:
        enhanced_scores["D020"] = enhanced_scores.get("D020", {"code": "D020", "name": "Riscossione", "score": 0})
        enhanced_scores["D020"]["score"] = max(enhanced_scores["D020"].get("score", 0), 6)

    return enhanced_scores

def removeRedundantCategories(categories: List[Dict]) -> List[Dict]:
    """
    Rimuove categorie ridondanti o in conflitto tra loro
    """
    if len(categories) <= 1:
        return categories

    result = [categories[0]]  # Inizia con la categoria principale

    # Gruppi di categorie che sono spesso correlate e potrebbero essere ridondanti
    related_groups = [
        # Imposte dirette correlate
        ["A010", "A020", "A030"],  # IRPEF, IRES, ILOR
        # Tributi locali correlati
        ["C020", "C030", "C040", "C050", "C060", "C070", "C080", "C090"],  # IMU/ICI e altri tributi locali
        # Procedure correlate
        ["D020", "D040", "D050"]  # Riscossione, Accertamento, Sanzioni
    ]

    # Verifica per ogni categoria rimanente
    for i in range(1, len(categories)):
        current = categories[i]
        is_redundant = False

        # Controlla se è ridondante rispetto a categorie già incluse
        for included in result:
            # Verifica se appartengono allo stesso gruppo di categorie correlate
            for group in related_groups:
                if current["code"] in group and included["code"] in group:
                    # Se la categoria attuale ha un punteggio molto inferiore, considerala ridondante
                    if current["score"] < included["score"] * 0.7:
                        is_redundant = True
                        break

            if is_redundant:
                break

        # Aggiungi solo se non è ridondante
        if not is_redundant:
            result.append(current)

    return result


def categorizeText(text: str, options: Dict = None) -> Dict:
    """
    Funzione principale per categorizzare una sentenza tributaria
    Supporta l'assegnazione di multiple categorie con limitazioni ragionevoli
    """
    # Configurazione predefinita
    if options is None:
        options = {}

    config = {
        "maxCategories": options.get("maxCategories", 3),  # Massimo numero di categorie da assegnare
        "scoreThreshold": options.get("scoreThreshold", 3),  # Punteggio minimo per considerare una categoria
        "minScoreRatio": options.get("minScoreRatio", 0.4)  # Rapporto minimo rispetto al punteggio massimo
    }

    # Prepara il testo per l'analisi
    processed_text = preprocessText(text)

    # Override immediati basati su pattern specifici
    if isRiscossioneDocument(processed_text):
        return {
            "primaryCategory": {
                "code": "D020",
                "name": "Riscossione",
                "score": 10,
                "confidence": 0.9
            },
            "categories": [
                {
                    "code": "D020",
                    "name": "Riscossione",
                    "score": 10,
                    "confidence": 0.9
                }
            ]
        }

    # Struttura per memorizzare i punteggi
    scores = {}

    # Estrai informazioni dal dispositivo
    dispositive_info = analyzeDispositive(processed_text)

    # Calcola i punteggi per ciascuna categoria
    for group_name, categories in taxCategoryGroups.items():
        for code, category in categories.items():
            score = 0

            # Parole chiave primarie (più peso)
            primary_keywords = category.get("primaryKeywords", [])
            primary_matches = countKeywordMatches(processed_text, primary_keywords)
            score += primary_matches * 2

            # Parole chiave secondarie
            secondary_keywords = category.get("keywords", [])
            secondary_matches = countKeywordMatches(processed_text, secondary_keywords)
            score += secondary_matches

            # Analisi contestuale per le parole chiave primarie
            for keyword in primary_keywords:
                 score += analyzeKeywordContext(processed_text, keyword)

            # Aggiusta per la posizione (parole chiave all'inizio hanno più peso)
            if score > 0:
                all_keywords = primary_keywords + secondary_keywords
                score = adjustScoreForPosition(processed_text, all_keywords, score)

            # Considera i riferimenti nel dispositivo
            if dispositive_info and "taxReferences" in dispositive_info:
                for ref in dispositive_info["taxReferences"]:
                    if ref["code"] == code:
                        score += 2  # Bonus significativo per menzioni nel dispositivo


            if score > 0:
                scores[code] = {
                    "code": code,
                    "name": category["name"],
                    "score": score
                }

    # Applica regole speciali per casi particolari
    enhanced_scores = applySpecialCaseRules(processed_text, scores)


    # Ordina le categorie per punteggio
    sorted_categories = sorted(enhanced_scores.values(), key=lambda x: x["score"], reverse=True)

    # Se non ci sono categorie, ritorna quella di default (Contenzioso)
    if not sorted_categories:
        default_category = {
            "code": "D060",
            "name": "Contenzioso",
            "score": 1,
            "confidence": 0.3,
            "isDefault": True
        }

        return {
            "primaryCategory": default_category,
            "categories": [default_category]
        }

    # Identifica la categoria principale
    primary_category = sorted_categories[0].copy()
    highest_score = primary_category["score"]

    # Calcola confidenza per la categoria principale
    # La confidenza è basata sul punteggio più alto e sulla presenza nel dispositivo
    confidence = 0.3 # Confidenza base
    if highest_score >= config["scoreThreshold"]:
        confidence = min(0.9, confidence + (highest_score / 20.0)) # Aumenta la confidenza con il punteggio

    if dispositive_info and any(ref["code"] == primary_category["code"] for ref in dispositive_info.get("taxReferences", [])):
        confidence = min(0.95, confidence + 0.2) # Bonus se la categoria principale è nel dispositivo


    primary_category["confidence"] = confidence

    # Filtra le categorie basate sulla soglia e il rapporto con il punteggio massimo
    filtered_categories = [
        cat for cat in sorted_categories
        if cat["score"] >= config["scoreThreshold"] or (highest_score > 0 and cat["score"] / highest_score >= config["minScoreRatio"])
    ]

    # Rimuovi categorie ridondanti o in conflitto
    final_categories = removeRedundantCategories(filtered_categories)

    # Limita il numero di categorie
    final_categories = final_categories[:config["maxCategories"]]

    # Aggiungi confidenza per le categorie aggiuntive (inferiore alla principale)
    for cat in final_categories:
        if cat["code"] != primary_category["code"]:
             cat["confidence"] = min(0.6, cat["score"] / highest_score * 0.5) # Confidenza ridotta per categorie secondarie


    return {
        "primaryCategory": primary_category,
        "categories": final_categories
    }

# =======================================================
# FUNZIONE PER ELABORARE UN SINGOLO FILE
# =======================================================

def process_single_file(file_path: str) -> Dict:
    """
    Elabora un singolo file PDF: estrae il testo e lo categorizza.
    Include il nome del file nel risultato.
    """
    try:
        # print(f"Elaborazione file: {os.path.basename(file_path)}") # Abilita per vedere l'avanzamento in tempo reale
        pdf_text = estrai_testo_completo_da_pdf(file_path)
        if not pdf_text:
            return {"file": os.path.basename(file_path), "errore": "Impossibile estrarre testo dal PDF"}

        categorization_result = categorizeText(pdf_text)
        categorization_result["file"] = os.path.basename(file_path) # Aggiunge il nome del file al risultato
        return categorization_result
    except Exception as e:
        # Cattura e logga qualsiasi eccezione durante l'elaborazione di un singolo file
        print(f"Errore critico durante l'elaborazione di {os.path.basename(file_path)}: {e}")
        return {"file": os.path.basename(file_path), "errore": f"Eccezione critica durante l'elaborazione: {e}"}


# =======================================================
# ESECUZIONE PER MULTIPLI FILE
# =======================================================

if __name__ == "__main__":
    # Directory contenente i file PDF
    # *** PERCORSO SPECIFICATO DALL'UTENTE ***
    pdf_directory = "../../../LLM_14/LLM_14/data/sentenze"  # <--- PERCORSO DELLA TUA DIRECTORY

    # Controlla se la directory esiste
    if not os.path.isdir(pdf_directory):
        print(f"Errore: La directory '{pdf_directory}' non esiste o non è una directory valida.")
    else:
        # Ottieni la lista di tutti i file PDF nella directory
        pdf_files = [os.path.join(pdf_directory, f) for f in os.listdir(pdf_directory) if f.lower().endswith('.pdf')]

        if not pdf_files:
            print(f"Nessun file PDF trovato nella directory: {pdf_directory}")
        else:
            print(f"Trovati {len(pdf_files)} file PDF da elaborare nella directory: {pdf_directory}")
            results = []

            # Usa ThreadPoolExecutor per elaborare i file in parallelo
            # Il numero di worker (thread) può essere regolato in base alle risorse del tuo sistema.
            # Generalmente, per task con un mix di I/O e CPU, un numero di thread
            # leggermente superiore al numero di core della CPU può essere efficiente.
            max_workers = os.cpu_count() * 2 if os.cpu_count() else 8 # Usa 2x core CPU o default a 8

            print(f"Utilizzo {max_workers} thread per l'elaborazione parallela.")

            start_time = time.time() # Avvia il cronometro

            # Usa tqdm se installato per mostrare l'avanzamento
            try:
                from tqdm import tqdm
                use_tqdm = True
            except ImportError:
                use_tqdm = False
                print("Suggerimento: installa 'tqdm' (pip install tqdm) per visualizzare la barra di avanzamento.")


            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                # Sottmetti le tasks di elaborazione per ogni file
                future_to_file = {executor.submit(process_single_file, file_path): file_path for file_path in pdf_files}

                if use_tqdm:
                     for future in tqdm(concurrent.futures.as_completed(future_to_file), total=len(pdf_files), desc="Elaborazione file"):
                        file_path = future_to_file[future]
                        try:
                            result = future.result()
                            results.append(result)
                        except Exception as exc:
                            # Gli errori specifici del file sono già loggati nella funzione process_single_file
                            results.append({"file": os.path.basename(file_path), "errore": f"Errore nell'executor: {exc}"})
                else:
                    # Itera sui risultati man mano che sono pronti (senza tqdm)
                    for future in concurrent.futures.as_completed(future_to_file):
                        file_path = future_to_file[future]
                        try:
                            result = future.result()
                            results.append(result)
                            # print(f"Completato: {os.path.basename(file_path)}") # Abilita per vedere completamento singoli file
                        except Exception as exc:
                             # Gli errori specifici del file sono già loggati nella funzione process_single_file
                             print(f'Errore nella gestione del risultato per {os.path.basename(file_path)}: {exc}')
                             results.append({"file": os.path.basename(file_path), "errore": f"Errore nella gestione del risultato: {exc}"})


            end_time = time.time() # Ferma il cronometro
            elapsed_time = end_time - start_time
            print(f"\nTempo totale di elaborazione: {elapsed_time:.2f} secondi")


            # Salva i risultati su un file JSON
            output_file = "categorization_results.json"
            try:
                with open(output_file, 'w', encoding='utf-8') as f:
                    json.dump(results, f, indent=2, ensure_ascii=False)
                print(f"Elaborazione completata. Risultati salvati in: {output_file}")
            except Exception as e:
                print(f"Errore nel salvataggio del file di output {output_file}: {e}")
                # Stampa i risultati a console se non è possibile salvarli su file
                print("\nRisultati (impossibile salvare su file):")
                print(json.dumps(results, indent=2, ensure_ascii=False))