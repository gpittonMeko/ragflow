import os
import requests
import time
import json
import re
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging
from configparser import ConfigParser

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

def _make_api_request(method: str, url: str, api_key: str, **kwargs) -> dict or None:
    """Funzione helper per effettuare richieste API con gestione errori standard."""
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {api_key}"
    timeout = kwargs.pop("timeout", API_TIMEOUT_SECONDS)

    try:
        response = requests.request(method, url, headers=headers, timeout=timeout, **kwargs)
        response.raise_for_status()

        try:
            response_json = response.json()
        except requests.exceptions.JSONDecodeError:
            logging.warning(f"Attenzione: Risposta non JSON da {url} con status {response.status_code}. Risposta: {response.text[:200]}...")
            return None

        if response_json.get("code") != 0:
            error_msg = response_json.get("message", "Errore API sconosciuto")
            logging.error(f"Errore API RAGFlow (Codice {response_json.get('code')}): {error_msg} - URL: {url}")
            raise requests.exceptions.HTTPError(f"Errore API RAGFlow {response_json.get('code')}: {error_msg}", response=response)

        return response_json

    except requests.exceptions.Timeout:
        logging.error(f"Errore: Timeout durante la connessione a {url} dopo {timeout} secondi.")
        raise
    except requests.exceptions.RequestException as e:
        logging.error(f"Errore di connessione all'API RAGFlow ({url}): {e}")
        raise

def list_ragflow_datasets(api_base_url: str, api_key: str) -> list or None:
    """Elenca tutti i dataset in RAGFlow."""
    url = f"{api_base_url}/api/v1/datasets"
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        response_json = _make_api_request("GET", url, api_key, headers=headers)
        return response_json.get("data", [])
    except requests.exceptions.RequestException:
        logging.error("Errore durante il recupero della lista dei dataset da RAGFlow.")
        return None

def find_dataset_id(api_base_url: str, api_key: str, dataset_name: str) -> int or None:
    """Trova l'ID di un dataset dato il suo nome."""
    logging.info(f"Ricerca dell'ID per il Dataset '{dataset_name}'...")
    datasets = list_ragflow_datasets(api_base_url, api_key)
    if datasets is None:
        logging.error("Impossibile ottenere la lista dei Dataset.")
        return None

    for dataset in datasets:
        if dataset.get("name") == dataset_name:
            found_id = dataset.get("id")
            logging.info(f"Trovato Dataset esistente '{dataset_name}' con ID: {found_id}")
            return found_id
    logging.info(f"Dataset '{dataset_name}' non trovato.")
    return None

def create_ragflow_dataset(api_base_url: str, api_key: str, dataset_name: str) -> int or None:
    """Crea un nuovo dataset in RAGFlow o ritorna l'ID se esiste già."""
    url = f"{api_base_url}/api/v1/datasets"
    headers = {"Content-Type": "application/json"}
    data = {
        "name": dataset_name,
        "embedding_model": EMBEDDING_MODEL,
        "chunk_method": CHUNK_METHOD,
        "parser_config": PARSER_CONFIG,
    }

    try:
        logging.info(f"Tentativo di creare il Dataset '{dataset_name}'...")
        response_json = _make_api_request("POST", url, api_key, headers=headers, json=data)
        dataset_id = response_json.get("data", {}).get("id")
        if dataset_id:
            logging.info(f"Dataset '{dataset_name}' creato con successo. ID: {dataset_id}")
            return dataset_id
        else:
            logging.error(f"Errore: ID del Dataset non trovato nella risposta di creazione per '{dataset_name}'. Risposta: {response_json}")
            return None
    except requests.exceptions.HTTPError as e:
        response_data = e.response.json() if e.response else {}
        if response_data.get('code') == 102 and "Duplicated knowledgebase name in creating dataset." in response_data.get('message', ''):
            logging.info(f"Dataset '{dataset_name}' esiste già.")
            return find_dataset_id(api_base_url, api_key, dataset_name)
        else:
            logging.error(f"Fallimento nella creazione del Dataset '{dataset_name}'. Errore: {e}")
            return None
    except requests.exceptions.RequestException as e:
        logging.error(f"Errore durante la creazione del dataset: {e}")
        return None

def list_documents_in_ragflow(api_base_url: str, api_key: str, dataset_id: int) -> list or None:
    """Elenca tutti i documenti nel dataset specificato."""
    url = f"{api_base_url}/api/v1/datasets/{dataset_id}/documents"
    headers = {"Authorization": f"Bearer {api_key}"}
    logging.info(f"Recupero elenco documenti per Dataset ID: {dataset_id}...")
    try:
        response_json = _make_api_request("GET", url, api_key, headers=headers)
        docs = response_json.get("data", {}).get("docs", [])
        logging.info(f"Trovati {len(docs)} documenti nel Dataset.")
        return docs
    except requests.exceptions.RequestException as e:
        logging.error(f"Fallimento nel recuperare l'elenco dei documenti per Dataset ID '{dataset_id}'. Errore: {e}")
        return None

def delete_document_from_ragflow(api_base_url: str, api_key: str, dataset_id: int, document_id: int) -> bool:
    """Elimina un documento dal dataset specificato."""
    url = f"{api_base_url}/api/v1/datasets/{dataset_id}/documents/{document_id}"
    headers = {"Authorization": f"Bearer {api_key}"}
    logging.info(f"Tentativo di eliminare il documento con ID: {document_id} dal Dataset ID: {dataset_id}...")
    try:
        response_json = _make_api_request("DELETE", url, api_key, headers=headers)
        if response_json and response_json.get("code") == 0:
            logging.info(f"Documento con ID: {document_id} eliminato con successo.")
            return True
        else:
            logging.error(f"Errore durante l'eliminazione del documento con ID: {document_id}. Risposta: {response_json}")
            return False
    except requests.exceptions.RequestException as e:
        logging.error(f"Fallimento nell'eliminazione del documento con ID: {document_id}. Errore: {e}")
        return False

def upload_pdf_to_ragflow(api_base_url: str, api_key: str, dataset_id: int, pdf_filepath: str) -> tuple[int or None, str]:
    """Carica un singolo file PDF nel dataset specificato con retry."""
    url = f"{api_base_url}/api/v1/datasets/{dataset_id}/documents"
    filename = os.path.basename(pdf_filepath)

    for attempt in range(MAX_RETRIES):
        try:
            with open(pdf_filepath, "rb") as f:
                files = {"file": (filename, f, 'application/pdf')}
                response_json = _make_api_request("POST", url, api_key, files=files, timeout=UPLOAD_TIMEOUT_SECONDS)

            document_ids = response_json.get("data", [])
            if document_ids and isinstance(document_ids, list) and len(document_ids) > 0 and "id" in document_ids[0]:
                document_id = document_ids[0].get("id")
                return document_id, filename
            else:
                logging.error(f"Errore: ID documento non trovato nella risposta di upload per '{filename}'. Risposta: {response_json}")
                return None, filename

        except FileNotFoundError:
            logging.error(f"Errore: File locale non trovato: {pdf_filepath}")
            return None, filename
        except requests.exceptions.RequestException as e:
            logging.error(f"Fallimento nell'upload di '{filename}' (Tentativo {attempt + 1}/{MAX_RETRIES}). Errore: {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY_SECONDS)
            else:
                return None, filename
    return None, filename

def parse_documents_in_ragflow(api_base_url: str, api_key: str, dataset_id: int, doc_ids: list[int]) -> bool:
    """Attiva il parsing per una lista di documenti specifici in RAGFlow."""
    if not doc_ids:
        logging.info("Nessun ID documento fornito per il parsing.")
        return False

    url = f"{api_base_url}/api/v1/datasets/{dataset_id}/chunks"
    headers = {"Content-Type": "application/json"}
    data = {"document_ids": [str(doc_id) for doc_id in doc_ids]}

    logging.info(f"Invio richiesta di parsing per {len(doc_ids)} documenti...")
    try:
        _make_api_request("POST", url, api_key, headers=headers, json=data, timeout=API_TIMEOUT_SECONDS)
        logging.info("Richiesta di parsing inviata con successo.")
        return True
    except requests.exceptions.RequestException as e:
        logging.error(f"Fallimento nell'attivare il parsing per gli ID documento: {doc_ids}. Errore: {e}")
        return False

def monitor_parsing_status(api_base_url: str, api_key: str, dataset_id: int, doc_ids: list[int]) -> None:
    """Monitora lo stato del parsing dei documenti con barra di avanzamento."""
    logging.info("\nMonitoraggio dello stato del parsing...")
    with tqdm(total=len(doc_ids), desc="Parsing Progress") as pbar:
        while True:
            documents = list_documents_in_ragflow(api_base_url, api_key, dataset_id)
            if documents is None:
                logging.error("Errore durante il recupero dello stato dei documenti per il monitoraggio del parsing.")
                break

            completed_count = 0
            for doc in documents:
                if doc.get("id") in doc_ids:
                    if doc.get("run") == "3":  # 3 indica completato
                        completed_count += 1

            pbar.n = completed_count
            pbar.refresh()

            if completed_count == len(doc_ids):
                logging.info("Parsing completato per tutti i documenti.")
                break

            time.sleep(30)  # Controlla ogni 30 secondi

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

def process_unparsed_documents(api_base_url: str, api_key: str, dataset_id: int) -> None:
    """Trova e avvia il parsing per i documenti non parsati."""
    logging.info("\n--- Controllo e Parsing dei Documenti Non Parsati Esistenti ---")
    existing_documents = list_documents_in_ragflow(api_base_url, api_key, dataset_id)
    if existing_documents:
        unparsed_docs = [doc for doc in existing_documents if doc.get("run") != "3" and doc.get("id")]
        if unparsed_docs:
            unparsed_doc_ids = [doc["id"] for doc in unparsed_docs]
            logging.info(f"Trovati {len(unparsed_doc_ids)} documenti non parsati. Inizio parsing...")
            if parse_documents_in_ragflow(api_base_url, api_key, dataset_id, unparsed_doc_ids):
                monitor_parsing_status(api_base_url, api_key, dataset_id, unparsed_doc_ids)
            else:
                logging.error("!!! ERRORE nell'invio della richiesta di parsing per i documenti esistenti non parsati.")
        else:
            logging.info("Nessun documento esistente trovato che necessiti di parsing.")
    else:
        logging.warning("Impossibile recuperare l'elenco dei documenti esistenti per controllare lo stato del parsing.")
    logging.info("--- Controllo e Parsing dei Documenti Non Parsati Esistenti Completato ---")

def remove_duplicate_documents(api_base_url: str, api_key: str, dataset_id: int) -> None:
    """Rimuove i documenti duplicati dalla knowledge base."""
    logging.info("\n--- Controllo ed Eliminazione dei Duplicati nella Knowledge Base ---")
    existing_documents = list_documents_in_ragflow(api_base_url, api_key, dataset_id)
    if existing_documents:
        normalized_names = {}
        duplicates_found = False
        for doc in tqdm(existing_documents, desc="Controllo Duplicati KB"):
            name = doc.get("name")
            doc_id = doc.get("id")
            if name and doc_id:
                normalized_name = normalize_filename(name)
                if normalized_name in normalized_names:
                    duplicates_found = True
                    logging.warning(f"Trovato duplicato in RAGFlow: '{name}' (ID: {doc_id}) corrisponde a ID: {normalized_names[normalized_name]}. Eliminando...")
                    delete_document_from_ragflow(api_base_url, api_key, dataset_id, doc_id)
                else:
                    normalized_names[normalized_name] = doc_id
        if not duplicates_found:
            logging.info("Nessun documento duplicato trovato nella Knowledge Base.")
    else:
        logging.warning("Impossibile recuperare l'elenco dei documenti esistenti per controllare i duplicati.")
    logging.info("--- Controllo ed Eliminazione dei Duplicati nella Knowledge Base Completato ---")

def upload_single_pdf(pdf_filepath: str, api_base_url: str, api_key: str, dataset_id: int, processed_files: list[str]) -> tuple[int or None, str or None]:
    """Carica un singolo PDF e aggiorna la lista dei file processati."""
    filename = os.path.basename(pdf_filepath)
    if pdf_filepath not in processed_files:
        document_id, uploaded_filename = upload_pdf_to_ragflow(api_base_url, api_key, dataset_id, pdf_filepath)
        if document_id:
            logging.info(f"   => Caricato con successo '{uploaded_filename}' (Doc ID: {document_id})")
            return document_id, pdf_filepath
        else:
            logging.error(f"   => !!! ERRORE nel caricamento di '{filename}' dopo {MAX_RETRIES} tentativi !!!")
            return None, None
    else:
        logging.info(f"   => File '{filename}' già processato, saltato.")
        return None, None

# --- Main Script ---
if __name__ == "__main__":
    logging.info("--- Avvio Script Caricamento Documenti RAGFlow ---")
    start_time = time.time()

    local_pdf_files_with_normalized_names = list_pdf_files(PDF_DIRECTORY)
    if not local_pdf_files_with_normalized_names:
        logging.info("Nessun file PDF trovato nella directory specificata. Uscita.")
        exit()
    logging.info(f"Trovati {len(local_pdf_files_with_normalized_names)} file PDF locali.")
    local_normalized_names = {normalized_name: full_path for full_path, normalized_name in local_pdf_files_with_normalized_names}

    dataset_id = find_dataset_id(RAGFLOW_API_BASE_URL, RAGFLOW_API_KEY, DATASET_NAME)
    if not dataset_id:
        dataset_id = create_ragflow_dataset(RAGFLOW_API_BASE_URL, RAGFLOW_API_KEY, DATASET_NAME)
        if not dataset_id:
            logging.error("Impossibile creare o recuperare l'ID del Dataset. L'operazione non può continuare.")
            exit()
        logging.info(f"Dataset '{DATASET_NAME}' creato con ID: {dataset_id}")
    else:
        logging.info(f"Dataset '{DATASET_NAME}' trovato con ID: {dataset_id}")

    # Fase 1: Controllo e parsing dei documenti esistenti non parsati
    process_unparsed_documents(RAGFLOW_API_BASE_URL, RAGFLOW_API_KEY, dataset_id)

    # Fase 2: Rimozione dei documenti duplicati nella Knowledge Base
    remove_duplicate_documents(RAGFLOW_API_BASE_URL, RAGFLOW_API_KEY, dataset_id)

    existing_documents_list = list_documents_in_ragflow(RAGFLOW_API_BASE_URL, RAGFLOW_API_KEY, dataset_id)
    if existing_documents_list is None:
        logging.warning("Attenzione: Impossibile recuperare l'elenco dei documenti esistenti.")
        exit()
    existing_normalized_document_names = {normalize_filename(doc.get("name")): doc.get("id") for doc in existing_documents_list if doc.get("name")}
    logging.info(f"Controllo completato. {len(existing_normalized_document_names)} documenti già presenti (nomi normalizzati).")

    processed_files = load_processed_files()
    files_to_upload = []
    for full_path, normalized_name in local_pdf_files_with_normalized_names:
        filename = os.path.basename(full_path)
        if normalized_name not in existing_normalized_document_names and full_path not in processed_files:
            files_to_upload.append(full_path)
        elif normalized_name in existing_normalized_document_names:
            logging.info(f"Il file locale '{filename}' (nome normalizzato '{normalized_name}') sembra essere già presente nel Dataset (ID: {existing_normalized_document_names[normalized_name]}).")
            try:
                os.remove(full_path)
                logging.info(f"   => File locale '{filename}' eliminato perché duplicato nella Knowledge Base.")
            except OSError as e:
                logging.error(f"   => Errore durante l'eliminazione del file locale '{filename}': {e}")
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
        uploaded_doc_ids = []
        upload_errors = 0
        with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_UPLOADS) as executor:
            futures = {executor.submit(upload_single_pdf, pdf_filepath, RAGFLOW_API_BASE_URL, RAGFLOW_API_KEY, dataset_id, processed_files): pdf_filepath
                       for pdf_filepath in files_to_upload}
            for future in tqdm(as_completed(futures), total=total_files_to_process, desc="Caricamento PDF"):
                doc_id, uploaded_filepath = future.result()
                if doc_id:
                    uploaded_doc_ids.append(doc_id)
                    processed_files.append(uploaded_filepath)
                else:
                    upload_errors += 1
        save_processed_files(processed_files)

        logging.info("\n--- Caricamento completato ---")
        logging.info(f" File caricati con successo: {len(uploaded_doc_ids)}")
        if upload_errors > 0:
            logging.error(f" Errori durante il caricamento: {upload_errors} file")
        if uploaded_doc_ids:
            logging.info("\nAttivazione parsing per i documenti caricati...")
            if parse_documents_in_ragflow(RAGFLOW_API_BASE_URL, RAGFLOW_API_KEY, dataset_id, uploaded_doc_ids):
                monitor_parsing_status(RAGFLOW_API_BASE_URL, RAGFLOW_API_KEY, dataset_id, uploaded_doc_ids)
            else:
                logging.error("!!! ERRORE nell'invio della richiesta di parsing. Controllare i log precedenti.")
        elif upload_errors == total_files_to_process:
            logging.info("\nNessun file caricato con successo, parsing non attivato.")

    end_time = time.time()
    logging.info(f"\n--- Operazione completata in {end_time - start_time:.2f} secondi ---")