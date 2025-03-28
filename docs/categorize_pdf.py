import os
import json
import PyPDF2
import openai  # Assicurati che questa riga sia presente all'inizio del tuo script
from openai import OpenAI  # Importa specificamente la classe OpenAI
from typing import List, Dict

# =======================================================
# CONFIGURAZIONE: API e modello
# =======================================================
# La chiave API viene letta dalla variabile d'ambiente OPEN_AI_API
openai.api_key = os.environ.get("OPEN_AI_API")
MODEL_NAME = "gpt-4o-mini-2024-07-18"

# =======================================================
# FUNZIONI DI BASE PER L'ESTRAZIONE DEL TESTO
# =======================================================

def estrai_testo_parziale_da_pdf(percorso_pdf: str, pagine_iniziali: int = 2, pagine_finali: int = 1) -> str:
    """
    Estrae solo le prime 'pagine_iniziali' e le ultime 'pagine_finali' dal PDF,
    per ridurre il numero di token inviati al modello.
    Se il PDF ha meno pagine, prende tutte quelle disponibili.
    """
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

def suddividi_testo_in_chunk(testo: str, max_caratteri: int = 1500) -> List[str]:
    """
    Suddivide il testo in blocchi (chunk) di dimensione massima 'max_caratteri',
    per evitare di superare il limite di token per ogni chiamata.
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
# FUNZIONI DI ESTRAZIONE METADATI CON GPT
# =======================================================

def chiama_gpt_4o_mini(testo: str, filename: str) -> dict:
    """
    Chiama il modello 'gpt-4o-mini' con un prompt che richiede di estrarre i metadati dettagliati
    di una sentenza o atto (tributario). La risposta deve essere un JSON valido.
    """
    prompt_utente = f"""
Sei un sistema che estrae metadati dettagliati da sentenze e atti (tributari).
Rispondi con SOLO JSON valido con i seguenti campi (se pertinenti, altrimenti lascia il campo vuoto o usa null):
- "filename": "{filename}"
- "tipo_documento": "sentenza" o "prassi"
  se "sentenza":
    - "localizzazione_corte": <string> (es. "Corte di Giustizia Tributaria di secondo grado della SICILIA")
    - "composizione_corte": <string> (indicare presidente, relatore, giudici - es. "Presidente: ..., Relatore: ..., Giudici: ...")
    - "grado_di_giudizio": <string> (es. "primo grado", "secondo grado")
    - "esito_controversia": <string> (es. "rigetta il ricorso", "accoglie l'appello", "cessazione della materia del contendere")
    - "anno_numero_sentenza": <string> (formato "AAAA_NNNNN" - es. "2024_9805")
    - "numero_sentenza": <string> (solo il numero - es. "9805")
    - "anno_sentenza": <number> (solo l'anno - es. 2024)
    - "grado_autorita_emittente": <string> (es. "CGT secondo grado/Regionale", "CGT primo grado/Provinciale")
    - "autorita_emittente": <string> (es. "Commissione Tributaria Provinciale di Caltanissetta", "Corte di Giustizia Tributaria di secondo grado della Sicilia")
    - "sentenza_impugnata": <string> ("SI" o "NO")
    - "data_deposito_da": <string> (formato "AAAA-MM-GG", se presente un intervallo)
    - "data_deposito_fino_a": <string> (formato "AAAA-MM-GG", se presente un intervallo)
    - "valore_controversia": <string> (es. "Fino a 5.000 euro", "Da 20.000,01 a 1.000.000 euro")
    - "tipo_giudizio": <string> (es. "Monocratico", "Collegiale")
    - "esito_giudizio": <string> (es. "Favorevole al contribuente", "Favorevole all'ufficio", "Conciliazione")
    - "materia": <string> (es. "IMU ex Ici", "Accertamento imposte")
    - "spese_giudizio": <string> (es. "A carico del contribuente", "Compensate")
  se "prassi":
    - "tipologia_prassi": <string> (es. "Circolare", "Risoluzione")
    - "anno_prassi": <number> (es. 2023)
    - "numero_prassi": <string> (es. "123/E")
- "massimario": [elenco di etichette o capitoli rilevanti]
- "riferimenti_normativi": [elenco di articoli di legge, decreti, ecc.]

Testo:
\"\"\"{testo}\"\"\"
"""
    try:
        client = OpenAI() # Inizializza il client OpenAI

        completion = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": "Sei un assistente specializzato in testi giuridici. Fornisci solo output in JSON valido."},
                {"role": "user", "content": prompt_utente}
            ],
            temperature=0.0,
            max_tokens=800 # Aumento dei token massimi per risposte più lunghe
        )
        output = completion.choices[0].message.content
        try:
            parsed = json.loads(output)
        except json.JSONDecodeError:
            parsed = {
                "filename": filename,
                "raw_output": output,
                "errore": "JSONDecodeError: output non valido"
            }
        return parsed
    except Exception as e:
        return {"filename": filename, "errore": f"Errore nella chiamata API: {e}"}

# =======================================================
# FUNZIONI PER PROCESSARE I PDF E GESTIRE IL PROGRESSO
# =======================================================

def processa_pdf_singolo(percorso_pdf: str, cartella_output: str = "output_json", forza_riprocessa: bool = False) -> dict:
    """
    Elabora un singolo PDF:
      - Estrae il testo parziale (prime 2 pagine + ultima 1)
      - Suddivide il testo in chunk
      - Per ogni chunk, chiama il modello per ottenere i metadati
      - Salva i metadati in un file JSON (un array di risultati) in cartella_output
    Se il file di output esiste e forza_riprocessa è False, salta l'elaborazione.
    Ritorna un dict con lo "status" (processed/skipped/error) e "details".
    """
    if not os.path.exists(cartella_output):
        os.makedirs(cartella_output)

    nome_file = os.path.basename(percorso_pdf)
    path_output = os.path.join(cartella_output, f"{nome_file}_metadata.json")

    # Salta se già processato e non forziamo il riprocessamento
    if not forza_riprocessa and os.path.exists(path_output):
        return {"status": "skipped", "details": f"File '{nome_file}' già processato, skip.", "output_json": path_output}

    try:
        testo_parziale = estrai_testo_parziale_da_pdf(percorso_pdf, 2, 1)
        chunks = suddividi_testo_in_chunk(testo_parziale, max_caratteri=1500)

        risultati_chunk = []
        for ch in chunks:
            ris = chiama_gpt_4o_mini(ch, nome_file)
            risultati_chunk.append(ris)

        with open(path_output, "w", encoding="utf-8") as f:
            json.dump(risultati_chunk, f, ensure_ascii=False, indent=2)

        return {"status": "processed", "details": f"OK, salvato in '{path_output}'", "output_json": path_output}
    except Exception as exc:
        return {"status": "error", "details": f"Errore: {exc}"}

def carica_progresso(nome_file: str = "progresso.json") -> Dict[str, Dict[str, str]]:
    """
    Carica il file di progresso (progresso.json) che tiene traccia dello stato dei PDF processati.
    Se il file non esiste, restituisce un dizionario vuoto.
    """
    if not os.path.exists(nome_file):
        return {}
    try:
        with open(nome_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {}

def salva_progresso(progress_dict: dict, nome_file: str = "progresso.json"):
    """
    Salva il dizionario di progresso in un file JSON.
    """
    with open(nome_file, "w", encoding="utf-8") as f:
        json.dump(progress_dict, f, ensure_ascii=False, indent=2)

def processa_cartella(cartella_pdf: str, cartella_output: str = "output_json", forza_riprocessa: bool = False, prefisso: str = "", file_progresso: str = "progresso.json"):
    """
    Processa tutti i file PDF in 'cartella_pdf'.
    Se 'prefisso' non è vuoto, elabora solo i PDF il cui nome inizia con quel prefisso.
    Utilizza (o crea) il file 'progresso.json' per tenere traccia dell'avanzamento, in modo da poter riprendere.
    Se forza_riprocessa è True, ignora i file già elaborati.
    """
    if not os.path.isdir(cartella_pdf):
        print(f"ERRORE: La cartella '{cartella_pdf}' non esiste o non è una directory.")
        return

    progresso = carica_progresso(file_progresso)

    pdf_files = [f for f in os.listdir(cartella_pdf) if f.lower().endswith(".pdf")]
    if prefisso:
        pdf_files = [f for f in pdf_files if f.startswith(prefisso)]

    pdf_files.sort()
    tot = len(pdf_files)
    processed_count = 0

    for i, pdf_name in enumerate(pdf_files, start=1):
        path_pdf = os.path.join(cartella_pdf, pdf_name)

        if not forza_riprocessa:
            stato_attuale = progresso.get(pdf_name, {}).get("status", "")
            if stato_attuale in ["processed", "skipped"]:
                print(f"[{i}/{tot}] Già elaborato (status: {stato_attuale}): {pdf_name}")
                continue

        print(f"[{i}/{tot}] Elaboro: {pdf_name}")
        esito = processa_pdf_singolo(path_pdf, cartella_output, forza_riprocessa)
        progresso[pdf_name] = esito
        salva_progresso(progresso, file_progresso)

        print(f" -> Risultato: {esito['status']} - {esito['details']}")
        processed_count += 1

    print(f"\nFinito. PDF totali: {tot}, elaborati in questa sessione: {processed_count}.")

# =======================================================
# MAIN: ESEMPIO DI USO
# =======================================================

if __name__ == "__main__":
    # Imposta il percorso della cartella contenente i PDF da elaborare
    CARTELLA_SENTENZE = "/home/ubuntu/LLM_14/LLM_14/data/sentenze"

    # Esegui il processing della cartella. Per riprendere da dove avevi lasciato,
    # il codice usa il file "progresso.json". Se forza_riprocessa è False, salta i file già elaborati.
    processa_cartella(
        cartella_pdf=CARTELLA_SENTENZE,
        cartella_output="output_json",
        forza_riprocessa=False,
        prefisso="",
        file_progresso="progresso.json"
    )