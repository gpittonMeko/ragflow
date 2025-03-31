import os
import requests
import time

# --- Configuration ---
PDF_DIRECTORY = "/home/ubuntu/LLM_14/LLM_14/data/sentenze"
RAGFLOW_API_BASE_URL = "https://sgailegal.it"
RAGFLOW_API_KEY = "ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm"
DATASET_NAME = "sentenze_dataset"
EMBEDDING_MODEL = "BAAI/bge-large-zh-v1.5"
CHUNK_METHOD = "naive"
PARSER_CONFIG = {"chunk_token_num": 128, "delimiter": "\\n!?;。；！？", "html4excel": False, "layout_recognize": True, "raptor": {"user_raptor": False}}

# --- Helper Functions ---

def list_pdf_files(directory):
    """Elenca tutti i file PDF nella directory specificata."""
    try:
        pdf_files = [f for f in os.listdir(directory) if f.lower().endswith(".pdf")]
        return [os.path.join(directory, f) for f in pdf_files]
    except FileNotFoundError:
        print(f"Errore: Directory non trovata: {directory}")
        return []
    except Exception as e:
        print(f"Errore durante l'elenco dei file in {directory}: {e}")
        return []

def _make_api_request(method, url, api_key, **kwargs):
    """Funzione helper per effettuare richieste API con gestione errori standard."""
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {api_key}"
    timeout = kwargs.pop("timeout", 60)

    try:
        response = requests.request(method, url, headers=headers, timeout=timeout, **kwargs)
        response.raise_for_status()

        try:
            response_json = response.json()
        except requests.exceptions.JSONDecodeError:
            print(f"Attenzione: Risposta non JSON da {url} con status {response.status_code}. Risposta: {response.text[:200]}...")
            return None

        if response_json.get("code") != 0:
            error_msg = response_json.get("message", "Errore API sconosciuto")
            print(f"Errore API RAGFlow (Codice {response_json.get('code')}): {error_msg} - URL: {url}")
            raise requests.exceptions.HTTPError(f"Errore API RAGFlow {response_json.get('code')}: {error_msg}", response=response)

        return response_json

    except requests.exceptions.Timeout:
        print(f"Errore: Timeout durante la connessione a {url} dopo {timeout} secondi.")
        raise
    except requests.exceptions.RequestException as e:
        print(f"Errore di connessione all'API RAGFlow ({url}): {e}")
        raise

def list_ragflow_datasets(api_base_url, api_key):
    """Elenca tutti i dataset in RAGFlow."""
    url = f"{api_base_url}/api/v1/datasets"
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        response_json = _make_api_request("GET", url, api_key, headers=headers)
        return response_json.get("data", [])
    except requests.exceptions.RequestException:
        return None

def find_dataset_id(api_base_url, api_key, dataset_name):
    """Trova l'ID di un dataset dato il suo nome."""
    print(f"Ricerca dell'ID per il Dataset '{dataset_name}'...")
    datasets = list_ragflow_datasets(api_base_url, api_key)
    if datasets is None:
        print("Impossibile ottenere la lista dei Dataset.")
        return None

    for dataset in datasets:
        if dataset.get("name") == dataset_name:
            found_id = dataset.get("id")
            print(f"Trovato Dataset esistente '{dataset_name}' con ID: {found_id}")
            return found_id
    print(f"Dataset '{dataset_name}' non trovato.")
    return None

def create_ragflow_dataset(api_base_url, api_key, dataset_name):
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
        print(f"Tentativo di creare il Dataset '{dataset_name}'...")
        response_json = _make_api_request("POST", url, api_key, headers=headers, json=data)
        dataset_id = response_json.get("data", {}).get("id")
        if dataset_id:
            print(f"Dataset '{dataset_name}' creato con successo. ID: {dataset_id}")
            return dataset_id
        else:
            print(f"Errore: ID del Dataset non trovato nella risposta di creazione per '{dataset_name}'. Risposta: {response_json}")
            return None
    except requests.exceptions.HTTPError as e:
        response_data = e.response.json() if e.response else {}
        if response_data.get('code') == 102 and "Duplicated knowledgebase name in creating dataset." in response_data.get('message', ''):
            print(f"Dataset '{dataset_name}' esiste già.")
            return find_dataset_id(api_base_url, api_key, dataset_name)
        else:
            print(f"Fallimento nella creazione del Dataset '{dataset_name}'.")
            return None
    except requests.exceptions.RequestException:
        return None

def list_documents_in_ragflow(api_base_url, api_key, dataset_id):
    """Elenca tutti i documenti nel dataset specificato."""
    url = f"{api_base_url}/api/v1/datasets/{dataset_id}/documents"
    headers = {"Authorization": f"Bearer {api_key}"}
    print(f"Recupero elenco documenti per Dataset ID: {dataset_id}...")
    try:
        response_json = _make_api_request("GET", url, api_key, headers=headers)
        docs = response_json.get("data", {}).get("docs", [])
        print(f"Trovati {len(docs)} documenti nel Dataset.")
        return docs
    except requests.exceptions.RequestException:
        print(f"Fallimento nel recuperare l'elenco dei documenti per Dataset ID '{dataset_id}'.")
        return None

def upload_pdf_to_ragflow(api_base_url, api_key, dataset_id, pdf_filepath):
    """Carica un singolo file PDF nel dataset specificato."""
    url = f"{api_base_url}/api/v1/datasets/{dataset_id}/documents"
    filename = os.path.basename(pdf_filepath)

    try:
        with open(pdf_filepath, "rb") as f:
            files = {"file": (filename, f, 'application/pdf')}
            response_json = _make_api_request("POST", url, api_key, files=files, timeout=300)

        document_id = response_json.get("data", [{}])[0].get("id")
        if document_id:
            print(f"File '{filename}' caricato con successo (Doc ID: {document_id})")
            return document_id
        else:
            print(f"Errore: ID documento non trovato nella risposta di upload per '{filename}'. Risposta: {response_json}")
            return None

    except FileNotFoundError:
        print(f"Errore: File locale non trovato: {pdf_filepath}")
        return None
    except requests.exceptions.RequestException:
        print(f"Fallimento nell'upload di '{filename}'.")
        return None

def parse_documents_in_ragflow(api_base_url, api_key, dataset_id, doc_ids):
    """Attiva il parsing per una lista di documenti specifici in RAGFlow."""
    if not doc_ids:
        print("Nessun ID documento fornito per il parsing.")
        return False

    url = f"{api_base_url}/api/v1/datasets/{dataset_id}/chunks"
    headers = {"Content-Type": "application/json"}
    data = {"document_ids": [str(doc_ids) for doc_ids in doc_ids]}

    print(f"Invio richiesta di parsing per {len(doc_ids)} documenti...")
    try:
        _make_api_request("POST", url, api_key, headers=headers, json=data, timeout=120)
        print("Richiesta di parsing inviata con successo.")
        return True
    except requests.exceptions.RequestException:
        print(f"Fallimento nell'attivare il parsing per gli ID documento: {doc_ids}.")
        return False