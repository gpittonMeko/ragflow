import os
import json
import PyPDF2
import openai  # Assicurati che questa riga sia presente all'inizio del tuo script
from openai import OpenAI  # Importa specificamente la classe OpenAI
from typing import List, Dict, Optional
import time
from tqdm import tqdm  # Importa la libreria tqdm per la barra di progresso
import concurrent.futures
import threading

# =======================================================
# CONFIGURAZIONE: API e modello
# =======================================================
# La chiave API viene letta dalla variabile d'ambiente OPEN_AI_API
openai.api_key = os.environ.get("OPEN_AI_API")
MODEL_NAME = "gpt-4o-mini-2024-07-18"

# Variabile globale per memorizzare i metadati dell'ultima sentenza elaborata (thread-safe)
last_processed_metadata = None
metadata_lock = threading.Lock()

# Variabile per controllare se l'elaborazione è in corso
processing_active = True

# =======================================================
# FUNZIONI DI BASE PER L'ESTRAZIONE DEL TESTO
# =======================================================

def estrai_testo_parziale_da_pdf(percorso_pdf: str, pagine_iniziali: int = 2, pagine_finali: int = 1) -> str:
    """
    Estrae solo le prime 'pagine_iniziali' e le ultime 'pagine_finali' dal PDF,
    per ridurre il numero di token inviati al modello.
    Se il PDF ha meno pagine, prende tutte quelle disponibili.
    """
    print(f"[LOG] [{threading.current_thread().name}] Estrazione testo parziale da: {percorso_pdf}")
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

def estrai_testo_completo_da_pdf(percorso_pdf: str) -> str:
    """
    Estrae tutto il testo da un file PDF.
    """
    print(f"[LOG] [{threading.current_thread().name}] Estrazione testo completo da: {percorso_pdf}")
    testo_completo = ""
    try:
        with open(percorso_pdf, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                testo_completo += page.extract_text() + "\n"
    except Exception as e:
        print(f"[LOG] [{threading.current_thread().name}] Errore nell'estrazione del testo completo da {percorso_pdf}: {e}")
    return testo_completo

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
    di una sentenza o atto (tributario) e di categorizzarlo secondo il massimario, utilizzando i filtri forniti.
    La risposta deve essere un JSON valido e conciso.
    """
    prompt_utente = f"""
Sei un sistema esperto nell'analisi di sentenze e atti (tributari) italiani.
Il tuo obiettivo è estrarre metadati precisi e categorizzare il documento secondo il massimario,
utilizzando i seguenti campi e le loro possibili opzioni come riferimento per l'estrazione.
Rispondi con un JSON valido e LACONICO con i seguenti campi (se pertinenti, altrimenti lascia il campo vuoto o usa null):
- "filename": "{filename}"
- "tipo_documento": "sentenza" o "prassi"
  se "sentenza":
    - "localizzazione_corte": <string>
    - "composizione_corte": <string> (indicare solo presidente e relatore se disponibili)
    - "grado_di_giudizio": <string> (opzioni: "primo grado", "secondo grado")
    - "esito_controversia": <string> (usa una frase breve e chiara)
    - "anno_numero_sentenza": <string> (formato "AAAA_NNNNN")
    - "numero_sentenza": <string> (solo il numero)
    - "anno_sentenza": <number> (solo l'anno)
    - "grado_autorita_emittente": <string> (opzioni: "CGT primo grado/Provinciale", "CGT secondo grado/Regionale")
    - "autorita_emittente": <string>
    - "sentenza_impugnata": <string> (opzioni: "SI", "NO")
    - "data_deposito": <string> (formato "AAAA-MM-GG" se una singola data è chiaramente indicata)
    - "valore_controversia": <string> (opzioni: "Fino a 5.000 euro", "Da 5.000,01 a 20.000 euro", "Da 20.000,01 a 1.000.000 euro", "Oltre 1.000.000 euro")
    - "tipo_giudizio": <string> (opzioni: "Monocratico", "Collegiale")
    - "esito_giudizio": <string> (opzioni: "Conciliazione", "Condono ed altri esiti", "Esito non definitorio su pronunciam. definitorio", "Favorevole al contribuente", "Favorevole all'ufficio", "Giudizio intermedio", "Reclamo respinto")
    - "materia": <string> (opzioni: "Accertamento imposte", "Accise armonizzate - Alcole", "Accise armonizzate - Prodotti energetici ed elettricità", "Accise non armonizzate", "Agevolazioni", "Bollo", "Catasto", "Concessioni governative", "Condono", "Contenzioso", "Cosap", "Demanio", "Diritti e tributi indiretti vari", "Dogane", "Iciap", "Ilor", "Imposta erariale di trascrizione", "Imposta sulle assicurazioni", "Imu ex Ici", "Intrattenimenti", "Invim", "Ipotecarie e catastali", "Irap", "Ires (ex Irpeg)", "Irpef", "Iva", "Pubblicità e pubbliche affissioni", "Pubblicità immobiliare", "Radiodiffusioni", "Rapporti con l'AF", "Registro", "Rimborsi", "Riscossione", "Servizi estimativi (OMI)", "Successioni e donazioni", "Tarsu", "Tassa sui contratti di borsa", "Tasse automobilistiche", "Tosap", "Tributi locali vari", "Violazioni e sanzioni")
    - "spese_giudizio": <string> (opzioni: "Compensate", "A carico del contribuente", "A carico dell'ufficio")
  se "prassi":
    - "tipologia_prassi": <string>
    - "anno_prassi": <number>
    - "numero_prassi": <string>
- "massimario": [elenco di massimo 3 etichette o capitoli del massimario più pertinenti al contenuto principale del documento. Sii molto conciso e usa termini standard.]
- "riferimenti_normativi": [elenco di massimo 3 riferimenti normativi principali (articoli di legge, decreti, ecc.). Riporta solo i riferimenti espliciti.]

Testo:
\"\"\"{testo}\"\"\"
"""
    try:
        client = OpenAI() # Inizializza il client OpenAI
        print(f"[LOG] [{threading.current_thread().name}] Chiamata API per: {filename}")
        start_time = time.time()
        completion = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": "Sei un assistente specializzato in testi giuridici. Fornisci solo output in JSON valido e sii molto conciso."},
                {"role": "user", "content": prompt_utente}
            ],
            temperature=0.1, # Abbasso la temperatura per risposte più deterministiche
            max_tokens=700 # Regolo i token massimi
        )
        end_time = time.time()
        print(f"[LOG] [{threading.current_thread().name}] Risposta API ricevuta per: {filename} in {end_time - start_time:.2f} secondi.")
        output = completion.choices[0].message.content
        try:
            parsed = json.loads(output)
        except json.JSONDecodeError:
            parsed = {
                "filename": filename,
                "raw_output": output,
                "errore": "JSONDecodeError: output non valido"
            }
            print(f"[LOG] [{threading.current_thread().name}] Errore JSONDecode per: {filename} - Output: {output}")
        return parsed
    except Exception as e:
        print(f"[LOG] [{threading.current_thread().name}] Errore nella chiamata API per {filename}: {e}")
        return {"filename": filename, "errore": f"Errore nella chiamata API: {e}"}

# =======================================================
# FUNZIONI PER PROCESSARE I PDF E GESTIRE IL PROGRESSO
# =======================================================

def processa_pdf_singolo(percorso_pdf: str, cartella_output: str = "output_json", forza_riprocessa: bool = False, filters: Optional[Dict] = None) -> dict:
    """
    Elabora un singolo PDF:
      - Estrae il testo parziale (prime 2 pagine + ultima 1)
      - Applica filtri sul testo parziale (se presenti)
      - Se il filtro 'contains_text' fallisce, salta l'elaborazione.
      - Suddivide il testo in chunk
      - Per ogni chunk, chiama il modello per ottenere i metadati
      - Salva i metadati in un file JSON (un array di risultati) in cartella_output
    Se il file di output esiste e forza_riprocessa è False, salta l'elaborazione.
    Ritorna un dict con lo "status" (processed/skipped/error/filtered) e "details".
    Aggiorna la variabile globale con i metadati dell'ultima sentenza elaborata.
    """
    global last_processed_metadata
    nome_file = os.path.basename(percorso_pdf)
    thread_name = threading.current_thread().name
    print(f"[LOG] [{thread_name}] Inizio elaborazione PDF: {nome_file}")
    if not os.path.exists(cartella_output):
        print(f"[LOG] [{thread_name}] Creazione cartella output: {cartella_output}")
        os.makedirs(cartella_output)

    path_output = os.path.join(cartella_output, f"{nome_file}_metadata.json")

    # Salta se già processato e non forziamo il riprocessamento
    if not forza_riprocessa and os.path.exists(path_output):
        print(f"[LOG] [{thread_name}] File già processato, skip: {nome_file}")
        return {"status": "skipped", "details": f"File '{nome_file}' già processato, skip.", "output_json": path_output}

    try:
        testo_parziale = estrai_testo_parziale_da_pdf(percorso_pdf, 2, 1)

        # Applica il filtro 'contains_text' sul testo parziale
        if filters and "contains_text" in filters:
            text_to_find = filters["contains_text"]
            if text_to_find not in testo_parziale:
                print(f"[LOG] [{thread_name}] File '{nome_file}' filtrato perché non contiene '{text_to_find}' nel testo parziale.")
                return {"status": "filtered", "details": f"Non contiene '{text_to_find}' nel testo parziale."}

        chunks = suddividi_testo_in_chunk(testo_parziale, max_caratteri=1500)
        num_chunks = len(chunks)
        print(f"[LOG] [{thread_name}] {nome_file} suddiviso in {num_chunks} chunks.")

        risultati_chunk = []
        for i, ch in enumerate(chunks):
            print(f"[LOG] [{thread_name}] Elaborazione chunk {i+1}/{num_chunks} per {nome_file}")
            ris = chiama_gpt_4o_mini(ch, nome_file)
            risultati_chunk.append(ris)

        with open(path_output, "w", encoding="utf-8") as f:
            json.dump(risultati_chunk, f, ensure_ascii=False, indent=2)
        print(f"[LOG] [{thread_name}] Metadati salvati in: {path_output}")

        # Aggiorna la variabile globale con i metadati (prendendo l'ultimo blocco se è una sentenza)
        if risultati_chunk and risultati_chunk[-1].get("tipo_documento") == "sentenza":
            with metadata_lock:
                last_processed_metadata = risultati_chunk[-1]
                print(f"[LOG] [{thread_name}] Ultimo metadato elaborato aggiornato per: {nome_file}")

        print(f"[LOG] [{thread_name}] Fine elaborazione PDF: {nome_file} - Status: processed")
        return {"status": "processed", "details": f"OK, salvato in '{path_output}'", "output_json": path_output}
    except Exception as exc:
        print(f"[LOG] [{thread_name}] Errore durante l'elaborazione di {nome_file}: {exc}")
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

def processa_cartella(cartella_pdf: str, cartella_output: str = "output_json", forza_riprocessa: bool = False, prefisso: str = "", file_progresso: str = "progresso.json", num_workers: int = 4, filters: Optional[Dict] = None):
    """
    Processa tutti i file PDF in 'cartella_pdf' in parallelo con filtri opzionali.
    Se 'prefisso' non è vuoto, elabora solo i PDF il cui nome inizia con quel prefisso.
    Utilizza (o crea) il file 'progresso.json' per tenere traccia dell'avanzamento.
    Se forza_riprocessa è True, ignora i file già elaborati.
    num_workers: numero di processi paralleli da utilizzare.
    filters: un dizionario opzionale con criteri di filtro.
             Esempio: {"date_range": ("2022-08-10", "2023-10-10"), "contains_text": "parola chiave"}
    """
    global last_processed_metadata, processing_active
    print(f"[LOG] Inizio processa_cartella con cartella: {cartella_pdf}, num_workers: {num_workers}, filters: {filters}")
    if not os.path.isdir(cartella_pdf):
        print(f"[ERRORE] La cartella '{cartella_pdf}' non esiste o non è una directory.")
        return

    progresso = carica_progresso(file_progresso)
    pdf_files = sorted([f for f in os.listdir(cartella_pdf) if f.lower().endswith(".pdf")])
    if prefisso:
        pdf_files = [f for f in pdf_files if f.startswith(prefisso)]

    filtered_pdf_files_by_name = []
    if filters and "date_range" in filters:
        start_date_str, end_date_str = filters["date_range"]
        print(f"[LOG] Applicazione filtro per intervallo di date: {filters['date_range']}")
        for pdf_name in pdf_files:
            try:
                anno = int(pdf_name.split('_')[-1].split('.')[0][:4])
                if start_date_str[:4] <= str(anno) <= end_date_str[:4]:
                    filtered_pdf_files_by_name.append(pdf_name)
            except:
                print(f"[LOG] Impossibile analizzare la data dal nome del file: {pdf_name} per il filtro data.")
        pdf_files = filtered_pdf_files_by_name
        print(f"[LOG] File dopo applicazione filtro data: {pdf_files}")
    elif filters and "date_range" in filters:
        print(f"[LOG] Applicazione filtro per intervallo di date: {filters['date_range']}")
        # Se non ci sono altri filtri, ma c'è un filtro data, lo applichiamo qui
        filtered_pdf_files_by_name = []
        start_date_str, end_date_str = filters["date_range"]
        for pdf_name in pdf_files:
            try:
                anno = int(pdf_name.split('_')[-1].split('.')[0][:4])
                if start_date_str[:4] <= str(anno) <= end_date_str[:4]:
                    filtered_pdf_files_by_name.append(pdf_name)
            except:
                print(f"[LOG] Impossibile analizzare la data dal nome del file: {pdf_name} per il filtro data.")
        pdf_files = filtered_pdf_files_by_name
        print(f"[LOG] File dopo applicazione filtro data: {pdf_files}")


    tot = len(pdf_files)
    processed_count = 0
    start_time = time.time()

    print(f"[LOG] Inizio elaborazione parallela di {tot} file PDF con {num_workers} workers.")
    with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as executor:
        futures = {}
        for pdf_name in pdf_files:
            future = executor.submit(processa_pdf_singolo, os.path.join(cartella_pdf, pdf_name), cartella_output, forza_riprocessa, filters) # Passa i filtri
            futures[future] = pdf_name
            print(f"[LOG] Sottomessa elaborazione per: {pdf_name}")

        for future in tqdm(concurrent.futures.as_completed(futures), total=tot, desc="Elaborazione PDF"):
            pdf_name = futures[future]
            try:
                esito = future.result()
                progresso[pdf_name] = esito
                salva_progresso(progresso, file_progresso)
                if esito["status"] == "processed":
                    processed_count += 1
            except Exception as exc:
                print(f'[ERRORE] {pdf_name} ha generato un\'eccezione: {exc}')

    processing_active = False
    print(f"[LOG] Elaborazione parallela completata.")
    end_time = time.time()
    total_time = end_time - start_time
    print(f"\nFinito. PDF totali: {tot}, elaborati: {processed_count}.")
    print(f"Tempo totale impiegato: {total_time:.2f} secondi.")

def monitor_and_display_metadata():
    """
    Funzione per monitorare l'input dell'utente e mostrare l'ultimo metadato elaborato.
    Questa funzione ora gira in un thread separato per non bloccare l'elaborazione principale.
    """
    global last_processed_metadata, processing_active
    print("[LOG] Avvio thread monitoraggio metadati.")
    while processing_active:
        command = input("Digita 'm' e premi Invio per mostrare l'ultimo metadato, 'q' per uscire: ").lower()
        if command == 'm':
            with metadata_lock:
                if last_processed_metadata:
                    print("\nUltimo Metadato Elaborato:")
                    print(json.dumps(last_processed_metadata, indent=2, ensure_ascii=False))
                else:
                    print("\nNessuna sentenza è stata ancora elaborata.")
        elif command == 'q':
            print("[LOG] Uscita dal monitoraggio metadati.")
            break
        else:
            print("Comando non valido. Digita 'm' o 'q'.")
    print("[LOG] Thread monitoraggio metadati terminato.")

# =======================================================
# MAIN: ESEMPIO DI USO
# =======================================================

if __name__ == "__main__":
    # Imposta il percorso della cartella contenente i PDF da elaborare
    CARTELLA_SENTENZE = "/home/ubuntu/LLM_14/LLM_14/data/sentenze"
    NUMERO_WORKERS = 4  # Imposta il numero di processi paralleli desiderato

    # Definisci i filtri se necessario
    filters = {
        # "date_range": ("2022-08-10", "2023-10-10"),
        "contains_text": "IMU" # Esempio di filtro per testo
    }

    print("[LOG] Avvio programma principale.")

    # Avvia il processing della cartella in parallelo con filtri
    processing_thread = threading.Thread(target=processa_cartella, args=(
        CARTELLA_SENTENZE,
        "output_json",
        False,
        "",
        "progresso.json",
        NUMERO_WORKERS,
        filters  # Passa il dizionario dei filtri
    ))
    processing_thread.start()
    print("[LOG] Thread di processing avviato.")

    # Avvia il monitoraggio dei metadati in un thread separato
    monitor_thread = threading.Thread(target=monitor_and_display_metadata)
    monitor_thread.daemon = True # Permette di uscire dal programma anche se questo thread è attivo
    monitor_thread.start()
    print("[LOG] Thread di monitoraggio avviato.")

    # Mantieni il thread principale in esecuzione per permettere ai thread di background di lavorare
    try:
        while processing_active:
            time.sleep(1) # Breve pausa per non consumare troppa CPU
    except KeyboardInterrupt:
        print("[LOG] Interruzione da tastiera rilevata. In attesa del completamento dei thread...")

    # Attendi che il thread di processing finisca
    processing_thread.join()
    print("[LOG] Thread di processing terminato.")

    print("[LOG] Programma terminato.")