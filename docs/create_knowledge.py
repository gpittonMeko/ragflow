import os
import time
import json
import re
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging
from configparser import ConfigParser
from ragflow_sdk import RAGFlow, DataSet, Document

# --- Setup Logging ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Configuration ---
CONFIG_FILE = "ragflow_config.ini"  # Using a config file for better management

# Load configuration from file
config = ConfigParser()
config.read(CONFIG_FILE)

# Default values if config file is missing or incomplete
DEFAULT_PDF_DIRECTORY = "/home/ubuntu/LLM_14/LLM_14/data/sentenze"
DEFAULT_RAGFLOW_API_BASE_URL = "https://sgailegal.it"
DEFAULT_RAGFLOW_API_KEY = "ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm"
DEFAULT_DATASET_NAME = "sentenze_1739462764_8500"
DEFAULT_EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
DEFAULT_CHUNK_METHOD = "naive"
DEFAULT_CHUNK_TOKEN_NUM = 128
DEFAULT_CHUNK_DELIMITER = "\\n!?;。；！？"
DEFAULT_HTML4EXCEL = False
DEFAULT_LAYOUT_RECOGNIZE = True
DEFAULT_USER_RAPTOR = False
DEFAULT_PROCESSED_FILES_FILE = "processed_files.json"
DEFAULT_MAX_CONCURRENT_UPLOADS = 5
DEFAULT_API_TIMEOUT_SECONDS = 120
DEFAULT_UPLOAD_TIMEOUT_SECONDS = 300
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_DELAY_SECONDS = 5

PDF_DIRECTORY = config.get("ragflow", "pdf_directory", fallback=DEFAULT_PDF_DIRECTORY)
RAGFLOW_API_BASE_URL = config.get("ragflow", "api_base_url", fallback=DEFAULT_RAGFLOW_API_BASE_URL)
RAGFLOW_API_KEY = config.get("ragflow", "api_key", fallback=DEFAULT_RAGFLOW_API_KEY)
DATASET_NAME = config.get("ragflow", "dataset_name", fallback=DEFAULT_DATASET_NAME)
EMBEDDING_MODEL = config.get("ragflow", "embedding_model", fallback=DEFAULT_EMBEDDING_MODEL)
CHUNK_METHOD = config.get("ragflow", "chunk_method", fallback=DEFAULT_CHUNK_METHOD)
CHUNK_TOKEN_NUM = config.getint("ragflow_parser", "chunk_token_num", fallback=DEFAULT_CHUNK_TOKEN_NUM)
CHUNK_DELIMITER = config.get("ragflow_parser", "delimiter", fallback=DEFAULT_CHUNK_DELIMITER)
HTML4EXCEL = config.getboolean("ragflow_parser", "html4excel", fallback=DEFAULT_HTML4EXCEL)
LAYOUT_RECOGNIZE = config.getboolean("ragflow_parser", "layout_recognize", fallback=DEFAULT_LAYOUT_RECOGNIZE)
USER_RAPTOR = config.getboolean("ragflow_parser_raptor", "user_raptor", fallback=DEFAULT_USER_RAPTOR)
PROCESSED_FILES_FILE = config.get("ragflow", "processed_files_file", fallback=DEFAULT_PROCESSED_FILES_FILE)
MAX_CONCURRENT_UPLOADS = config.getint("ragflow", "max_concurrent_uploads", fallback=DEFAULT_MAX_CONCURRENT_UPLOADS)
API_TIMEOUT_SECONDS = config.getint("ragflow", "api_timeout_seconds", fallback=DEFAULT_API_TIMEOUT_SECONDS)
UPLOAD_TIMEOUT_SECONDS = config.getint("ragflow", "upload_timeout_seconds", fallback=DEFAULT_UPLOAD_TIMEOUT_SECONDS)
MAX_RETRIES = config.getint("ragflow", "max_retries", fallback=DEFAULT_MAX_RETRIES)
RETRY_DELAY_SECONDS = config.getint("ragflow", "retry_delay_seconds", fallback=DEFAULT_RETRY_DELAY_SECONDS)

PARSER_CONFIG = {
    "chunk_token_num": CHUNK_TOKEN_NUM,
    "delimiter": CHUNK_DELIMITER,
    "html4excel": HTML4EXCEL,
    "layout_recognize": LAYOUT_RECOGNIZE,
    "raptor": {"user_raptor": USER_RAPTOR}
}

# --- Helper Functions ---

def normalize_filename(filename: str) -> str:
    """Rimuove i suffissi numerici tra parentesi e l'estensione dal nome del file."""
    base_name = os.path.splitext(filename)[0]
    return re.sub(r'\s*\(\d+\)$', '', base_name).strip()

def list_pdf_files(directory: str) -> list[tuple[str, str]]:
    """Elenca tutti i file PDF nella directory specificata e restituisce il percorso completo e il nome normalizzato."""
    try:
        pdf_files = [f for f in os.listdir(directory) if f.lower().endswith(".pdf")]
        return [(os.path.join(directory, f), normalize_filename(f)) for f in pdf_files]
    except FileNotFoundError:
        logging.error(f"Errore: Directory non trovata: {directory}")
        return []
    except Exception as e:
        logging.error(f"Errore durante l'elenco dei file in {directory}: {e}")
        return []

def load_processed_files() -> list[str]:
    """Carica l'elenco dei file già processati."""
    try:
        with open(PROCESSED_FILES_FILE, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return []
    except json.JSONDecodeError:
        logging.warning(f"Errore nella decodifica di {PROCESSED_FILES_FILE}. Inizializzazione con una lista vuota.")
        return []

def save_processed_files(processed_files: list[str]) -> None:
    """Salva l'elenco dei file processati."""
    with open(PROCESSED_FILES_FILE, "w") as f:
        json.dump(processed_files, f)

def upload_single_pdf(pdf_filepath: str, rag_object: RAGFlow, dataset: DataSet, processed_files: list[str]) -> tuple[str or None, str or None]:
    """Carica un singolo PDF e aggiorna la lista dei file processati."""
    filename = os.path.basename(pdf_filepath)
    if pdf_filepath not in processed_files:
        for attempt in range(MAX_RETRIES):
            try:
                with open(pdf_filepath, "rb") as f:
                    blob = f.read()
                documents = dataset.upload_documents([{"display_name": filename, "blob": blob}])
                if documents is None:
                    logging.error(f"  => Errore durante il caricamento di '{filename}'. Nessuna risposta ricevuta (Tentativo {attempt + 1}/{MAX_RETRIES}).")
                    if attempt < MAX_RETRIES - 1:
                        time.sleep(RETRY_DELAY_SECONDS)
                    continue
                elif len(documents) > 0:
                    document_id = documents[0].id
                    logging.info(f"  => Caricato con successo '{filename}' (Doc ID: {document_id})")
                    return document_id, pdf_filepath
                else:
                    logging.error(f"  => Errore: ID documento non trovato nella risposta di upload per '{filename}' (Tentativo {attempt + 1}/{MAX_RETRIES}). Risposta: {documents}")
                    if attempt < MAX_RETRIES - 1:
                        time.sleep(RETRY_DELAY_SECONDS)
                    continue
            except FileNotFoundError:
                logging.error(f"Errore: File locale non trovato: {pdf_filepath}")
                return None, filename
            except Exception as e:
                logging.error(f"Fallimento nell'upload di '{filename}' (Tentativo {attempt + 1}/{MAX_RETRIES}). Errore: {e}")
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_DELAY_SECONDS)
                else:
                    logging.error(f"  => !!! ERRORE nel caricamento di '{filename}' dopo {MAX_RETRIES} tentativi !!! Errore Finale: {e}")
                    return None, filename
        return None, filename
    else:
        logging.info(f"  => File '{filename}' già processato, saltato.")
        return None, None

def monitor_parsing_status(dataset: DataSet, doc_ids: list[str]) -> None:
    """Monitora lo stato del parsing dei documenti con barra di avanzamento."""
    logging.info("\nMonitoraggio dello stato del parsing...")
    with tqdm(total=len(doc_ids), desc="Parsing Progress") as pbar:
        while True:
            documents = dataset.list_documents()
            if documents is None:
                logging.error("Errore durante il recupero dello stato dei documenti per il monitoraggio del parsing.")
                break

            logging.debug(f"Risposta API (elenco documenti): {[doc.dict() for doc in documents]}") # Log della risposta API completa (livello DEBUG)

            completed_count = 0
            for doc in documents:
                if doc.id in doc_ids:
                    run_status = doc.run
                    progress_message = doc.progress_msg
                    logging.info(f"Document ID: {doc.id}, Stato Parsing (run): {run_status}, Messaggio di Progresso: {progress_message}")
                    if run_status == "DONE":
                        completed_count += 1

            pbar.n = completed_count
            pbar.refresh()

            if completed_count == len(doc_ids):
                logging.info("Parsing completato per tutti i documenti.")
                break

            time.sleep(30)  # Controlla ogni 30 secondi

def process_unparsed_documents(rag_object: RAGFlow, dataset: DataSet) -> None:
    """Trova e avvia il parsing per i documenti non parsati."""
    logging.info("\n--- Controllo e Parsing dei Documenti Non Parsati Esistenti ---")
    existing_documents = dataset.list_documents()
    if existing_documents:
        unparsed_docs = [doc for doc in existing_documents if doc.run != "DONE" and doc.id]
        if unparsed_docs:
            unparsed_doc_ids = [doc.id for doc in unparsed_docs]
            logging.info(f"Trovati {len(unparsed_doc_ids)} documenti non parsati. Inizio parsing...")
            try:
                dataset.async_parse_documents(document_ids=unparsed_doc_ids)
                monitor_parsing_status(dataset, unparsed_doc_ids)
            except Exception as e:
                logging.error(f"!!! ERRORE durante l'invio della richiesta di parsing per i documenti esistenti non parsati: {e}")
        else:
            logging.info("Nessun documento esistente trovato che necessiti di parsing.")
    else:
        logging.warning("Impossibile recuperare l'elenco dei documenti esistenti per controllare lo stato del parsing.")
    logging.info("--- Controllo e Parsing dei Documenti Non Parsati Esistenti Completato ---")

def remove_duplicate_documents(dataset: DataSet) -> None:
    """Rimuove i documenti duplicati dalla knowledge base."""
    logging.info("\n--- Controllo ed Eliminazione dei Duplicati nella Knowledge Base ---")
    existing_documents = dataset.list_documents()
    if existing_documents:
        normalized_names = {}
        duplicates_found = False
        for doc in tqdm(existing_documents, desc="Controllo Duplicati KB"):
            name = doc.name
            doc_id = doc.id
            if name and doc_id:
                normalized_name = normalize_filename(name)
                if normalized_name in normalized_names:
                    duplicates_found = True
                    logging.warning(f"Trovato duplicato in RAGFlow: '{name}' (ID: {doc_id}) corrisponde a ID: {normalized_names[normalized_name]}. Eliminando...")
                    dataset.delete_documents(ids=[doc_id])
                else:
                    normalized_names[normalized_name] = doc_id
        if not duplicates_found:
            logging.info("Nessun documento duplicato trovato nella Knowledge Base.")
    else:
        logging.warning("Impossibile recuperare l'elenco dei documenti esistenti per controllare i duplicati.")
    logging.info("--- Controllo ed Eliminazione dei Duplicati nella Knowledge Base Completato ---")

# # --- Main Script ---
if __name__ == "__main__":
    logging.info("--- Avvio Script Caricamento Documenti RAGFlow ---")
    start_time = time.time()

    local_pdf_files_with_normalized_names = list_pdf_files(PDF_DIRECTORY)
    if not local_pdf_files_with_normalized_names:
        logging.info("Nessun file PDF trovato nella directory specificata. Uscita.")
        exit()
    logging.info(f"Trovati {len(local_pdf_files_with_normalized_names)} file PDF locali.")
    local_normalized_names = {normalized_name: full_path for full_path, normalized_name in local_pdf_files_with_normalized_names}

    # Inizializzazione della SDK RAGFlow
    rag_object = RAGFlow(api_key=RAGFLOW_API_KEY, base_url=RAGFLOW_API_BASE_URL)

    # Ottieni o crea il dataset
    datasets = rag_object.list_datasets(name=DATASET_NAME)
    if datasets:
        dataset = datasets[0]
        logging.info(f"Dataset '{DATASET_NAME}' trovato con ID: {dataset.id}")
    else:
        try:
            dataset = rag_object.create_dataset(
                name=DATASET_NAME,
                embedding_model=EMBEDDING_MODEL,
                chunk_method=CHUNK_METHOD,
                parser_config=PARSER_CONFIG
            )
            logging.info(f"Dataset '{DATASET_NAME}' creato con ID: {dataset.id}")
        except Exception as e:
            logging.error(f"Impossibile creare o recuperare l'ID del Dataset. L'operazione non può continuare. Errore: {e}")
            exit()

    # Fase 1: Controllo e parsing dei documenti esistenti non parsati
    process_unparsed_documents(rag_object, dataset)

    # Fase 2: Rimozione dei documenti duplicati nella Knowledge Base
    remove_duplicate_documents(dataset)

    existing_documents_list = dataset.list_documents()
    if existing_documents_list is None:
        logging.warning("Attenzione: Impossibile recuperare l'elenco dei documenti esistenti.")
        exit()
    existing_normalized_document_names = {normalize_filename(doc.name): doc.id for doc in existing_documents_list if doc.name}
    logging.info(f"Controllo completato. {len(existing_normalized_document_names)} documenti già presenti (nomi normalizzati).")

    processed_files = load_processed_files()
    files_to_upload = []
    for full_path, normalized_name in local_pdf_files_with_normalized_names:
        filename = os.path.basename(full_path)
        if normalized_name not in existing_normalized_document_names and full_path not in processed_files:
            files_to_upload.append(full_path)
        elif normalized_name in existing_normalized_document_names:
            logging.info(f"Il file locale '{filename}' (nome normalizzato '{normalized_name}') sembra essere già presente nel Dataset (ID: {existing_normalized_document_names[normalized_name]}).")
        elif full_path in processed_files:
            logging.info(f"Il file locale '{filename}' è già stato processato e sarà saltato.")

    files_skipped = len(local_pdf_files_with_normalized_names) - len(files_to_upload)
    if files_skipped > 0:
        logging.info(f" {files_skipped} file locali sono già presenti nel Dataset (con o senza suffissi), sono stati processati o erano duplicati locali e sono stati gestiti.")

    if not files_to_upload:
        logging.info("\nNessun nuovo file da caricare.")
    else:
        total_files_to_process = len(files_to_upload)
        logging.info(f"\nInizio caricamento di {total_files_to_process} nuovi file PDF...")

        BATCH_SIZE = 10  # Definisci la dimensione del lotto
        uploaded_count = 0
        upload_errors = 0

        for i in range(0, len(files_to_upload), BATCH_SIZE):
            batch_files = files_to_upload[i:i + BATCH_SIZE]
            batch_uploaded_doc_ids = []
            batch_upload_errors = 0

            logging.info(f"\n--- Inizio caricamento del lotto di {len(batch_files)} file ({uploaded_count + 1}-{min(uploaded_count + BATCH_SIZE, total_files_to_process)}) ---")

            with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_UPLOADS) as executor:
                futures = {executor.submit(upload_single_pdf, pdf_filepath, rag_object, dataset, processed_files): pdf_filepath
                           for pdf_filepath in batch_files}
                for future in tqdm(as_completed(futures), total=len(batch_files), desc="Caricamento PDF (Lotto)"):
                    doc_id, uploaded_filepath = future.result()
                    if doc_id:
                        batch_uploaded_doc_ids.append(doc_id)
                        processed_files.append(uploaded_filepath)
                    else:
                        batch_upload_errors += 1

            uploaded_count += len(batch_uploaded_doc_ids)
            upload_errors += batch_upload_errors
            save_processed_files(processed_files)  # Salva i file processati dopo ogni lotto

            if batch_uploaded_doc_ids:
                logging.info(f"\nAttivazione parsing per {len(batch_uploaded_doc_ids)} documenti caricati nel lotto...")
                try:
                    dataset.async_parse_documents(document_ids=[str(doc_id) for doc_id in batch_uploaded_doc_ids])
                    monitor_parsing_status(dataset, [str(doc_id) for doc_id in batch_uploaded_doc_ids])
                    logging.info(f"Parsing completato per i documenti del lotto.")
                except Exception as e:
                    logging.error(f"!!! ERRORE nell'invio della richiesta di parsing per il lotto: {e}")
            else:
                logging.info("Nessun file caricato con successo in questo lotto, parsing non attivato.")

            logging.info(f"--- Fine caricamento del lotto. Caricati con successo: {len(batch_uploaded_doc_ids)}, Errori nel lotto: {batch_upload_errors}, Totale caricati: {uploaded_count}, Totale errori: {upload_errors} ---")

        logging.info("\n--- Caricamento completato ---")
        logging.info(f" File caricati con successo: {uploaded_count}")
        if upload_errors > 0:
            logging.error(f" Errori durante il caricamento: {upload_errors} file")

    end_time = time.time()
    logging.info(f"\n--- Operazione completata in {end_time - start_time:.2f} secondi ---")