import os
import requests
import time

# --- Configuration ---
# !!! MODIFICA QUESTI VALORI SECONDO LE TUE ESIGENZE !!!
PDF_DIRECTORY = "/home/ubuntu/LLM_14/LLM_14/data/sentenze" # Cartella contenente i PDF da caricare
RAGFLOW_API_BASE_URL = "https://sgailegal.it"  # URL base della tua istanza RAGFlow
RAGFLOW_API_KEY = "ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm" # La tua API key RAGFlow
KNOWLEDGE_BASE_NAME = "sentenze_kb" # Nome desiderato per il Knowledge Base in RAGFlow
# !!! FINE CONFIGURAZIONE MODIFICABILE !!!


# --- Helper Functions ---

def list_pdf_files(directory):
    """Elenca tutti i file PDF nella directory specificata."""
    try:
        # Cerca file .pdf ignorando maiuscole/minuscole
        pdf_files = [f for f in os.listdir(directory) if f.lower().endswith(".pdf")]
        # Ritorna i percorsi completi
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
    # Imposta un timeout di default se non specificato
    timeout = kwargs.pop("timeout", 60) # Default a 60 secondi

    try:
        response = requests.request(method, url, headers=headers, timeout=timeout, **kwargs)
        # Prova a decodificare JSON, gestisci errori se non è JSON valido
        try:
            response_json = response.json()
        except requests.exceptions.JSONDecodeError:
             # Se la risposta non è JSON ma lo status è ok (raro), potrebbe essere un problema
             if response.ok:
                 print(f"Attenzione: Risposta non JSON da {url} con status {response.status_code}. Risposta: {response.text[:200]}...")
                 # Potresti voler gestire questo caso specifico o ritornare un errore
             # Altrimenti, se non è JSON e lo status non è ok, è un errore HTTP standard
             response.raise_for_status() # Rilancerà l'errore HTTP appropriato
             # Questa riga non verrà raggiunta se raise_for_status() lancia un errore
             return None # Ritorno di sicurezza

        # Controlla il codice di successo specifico di RAGFlow (di solito 0)
        if response_json.get("code") != 0:
            error_msg = response_json.get("message", "Errore API sconosciuto")
            print(f"Errore API RAGFlow (Codice {response_json.get('code')}): {error_msg} - URL: {url}")
            # Lancia un'eccezione per segnalare il fallimento
            raise requests.exceptions.HTTPError(f"Errore API RAGFlow {response_json.get('code')}: {error_msg}", response=response)

        # Se tutto ok, ritorna il JSON decodificato
        return response_json

    except requests.exceptions.Timeout:
        print(f"Errore: Timeout durante la connessione a {url} dopo {timeout} secondi.")
        raise # Rilancia l'eccezione per fermare l'esecuzione o gestirla più in alto
    except requests.exceptions.RequestException as e:
        print(f"Errore di connessione all'API RAGFlow ({url}): {e}")
        raise # Rilancia l'eccezione


def list_ragflow_knowledge_bases(api_base_url, api_key):
    """Elenca tutti i knowledge base in RAGFlow."""
    # Endpoint corretto: /api/v1/knowledgebase/list
    url = f"{api_base_url}/api/v1/knowledgebase/list"
    try:
        # Usa il metodo GET
        response_json = _make_api_request("GET", url, api_key)
        # La lista è in response_json["data"]["kbs"]
        return response_json.get("data", {}).get("kbs", [])
    except (requests.exceptions.RequestException, requests.exceptions.HTTPError):
        # L'errore specifico è già stato stampato da _make_api_request
        return None # Ritorna None per indicare fallimento nel recuperare la lista

def find_knowledge_base_id(api_base_url, api_key, kb_name):
    """Trova l'ID di un knowledge base dato il suo nome."""
    print(f"Ricerca dell'ID per il Knowledge Base '{kb_name}'...")
    kbs = list_ragflow_knowledge_bases(api_base_url, api_key)
    if kbs is None:
        print("Impossibile ottenere la lista dei Knowledge Base.")
        return None # Fallimento nel listare i KB

    for kb in kbs:
        # Confronta i nomi
        if kb.get("name") == kb_name:
            found_id = kb.get("id")
            print(f"Trovato Knowledge Base esistente '{kb_name}' con ID: {found_id}")
            return found_id
    print(f"Knowledge Base '{kb_name}' non trovato.")
    return None # Non trovato

def create_ragflow_knowledge_base(api_base_url, api_key, kb_name):
    """Crea un nuovo knowledge base in RAGFlow o ritorna l'ID se esiste già."""
    # Endpoint corretto: /api/v1/knowledgebase/create
    url = f"{api_base_url}/api/v1/knowledgebase/create"
    headers = {"Content-Type": "application/json"}
    # Payload corretto: {"kb_name": kb_name}
    data = {"kb_name": kb_name}

    try:
        print(f"Tentativo di creare il Knowledge Base '{kb_name}'...")
        response_json = _make_api_request("POST", url, api_key, headers=headers, json=data)
        # L'ID è in response_json["data"]["kb_id"]
        kb_id = response_json.get("data", {}).get("kb_id")
        if kb_id:
            print(f"Knowledge Base '{kb_name}' creato con successo. ID: {kb_id}")
            return kb_id
        else:
            # Caso strano: successo (code 0) ma senza ID nella risposta
            print(f"Errore: ID del KB non trovato nella risposta di creazione per '{kb_name}'. Risposta: {response_json}")
            return None
    except requests.exceptions.HTTPError as e:
        # Controlla se l'errore è dovuto a nome duplicato
        # Il messaggio esatto potrebbe cambiare, adattalo se necessario
        response_data = e.response.json() if e.response else {}
        if response_data.get('code') == 102 and "Duplicated knowledgebase name" in response_data.get('message', ''):
             print(f"Knowledge Base '{kb_name}' esiste già.")
             # Se esiste, cerca il suo ID
             return find_knowledge_base_id(api_base_url, api_key, kb_name)
        else:
            # Altro errore HTTP (già stampato da _make_api_request)
             print(f"Fallimento nella creazione del Knowledge Base '{kb_name}'.")
             return None
    except requests.exceptions.RequestException:
         # Errore di connessione o JSON (già stampato)
         return None


def list_documents_in_ragflow(api_base_url, api_key, kb_id):
    """Elenca tutti i documenti nel knowledge base specificato."""
    # Endpoint corretto: /api/v1/document/list, Metodo POST
    url = f"{api_base_url}/api/v1/document/list"
    headers = {"Content-Type": "application/json"}
    # Payload corretto: {"kb_id": kb_id}
    data = {"kb_id": str(kb_id)} # Assicura che ID sia stringa

    print(f"Recupero elenco documenti per KB ID: {kb_id}...")
    try:
        # Timeout più lungo per liste potenzialmente grandi
        response_json = _make_api_request("POST", url, api_key, headers=headers, json=data, timeout=120)
        # Lista documenti in response_json["data"]["docs"]
        docs = response_json.get("data", {}).get("docs", [])
        print(f"Trovati {len(docs)} documenti nel Knowledge Base.")
        return docs
    except (requests.exceptions.RequestException, requests.exceptions.HTTPError):
        print(f"Fallimento nel recuperare l'elenco dei documenti per KB ID '{kb_id}'.")
        return None # Indica fallimento


def upload_pdf_to_ragflow(api_base_url, api_key, kb_id, pdf_filepath):
    """Carica un singolo file PDF nel knowledge base specificato."""
    # Endpoint corretto: /api/v1/document/upload
    url = f"{api_base_url}/api/v1/document/upload"
    filename = os.path.basename(pdf_filepath)

    try:
        with open(pdf_filepath, "rb") as f:
            # Dati form corretti: files={"file": ...} e data={"kb_id": ...}
            files = {"file": (filename, f, 'application/pdf')} # Specifica il mimetype
            data = {"kb_id": str(kb_id)}

            # Non impostare Content-Type manualmente per multipart/form-data
            # Timeout più lungo per l'upload
            response_json = _make_api_request("POST", url, api_key, files=files, data=data, timeout=300) # 5 minuti

        # ID e nome corretti sono in response_json["data"]["doc_id"] / ["doc_name"]
        document_id = response_json.get("data", {}).get("doc_id")
        document_name = response_json.get("data", {}).get("doc_name")

        if document_id and document_name:
            # Il messaggio di successo verrà stampato nel ciclo principale
            return document_id
        else:
            print(f"Errore: ID o Nome documento non trovati nella risposta di upload per '{filename}'. Risposta: {response_json}")
            return None

    except FileNotFoundError:
        print(f"Errore: File locale non trovato: {pdf_filepath}")
        return None
    except (requests.exceptions.RequestException, requests.exceptions.HTTPError) as e:
        # L'errore API/connessione è già stato stampato da _make_api_request o nella gestione eccezioni qui sopra
        print(f"Fallimento nell'upload di '{filename}'.")
        return None
    except Exception as e:
        # Cattura altri errori imprevisti durante l'upload
        print(f"Errore inaspettato durante l'upload di '{filename}': {e}")
        return None


def parse_documents_in_ragflow(api_base_url, api_key, doc_ids):
    """Attiva il parsing per una lista di documenti specifici in RAGFlow."""
    if not doc_ids:
        print("Nessun ID documento fornito per il parsing.")
        return False

    # Endpoint corretto: /api/v1/document/parse
    url = f"{api_base_url}/api/v1/document/parse"
    headers = {"Content-Type": "application/json"}
    # Payload corretto: {"doc_ids": doc_ids}
    # Assicurati che gli ID siano stringhe se l'API lo richiede
    data = {"doc_ids": [str(doc_id) for doc_id in doc_ids]}

    print(f"Invio richiesta di parsing per {len(doc_ids)} documenti...")
    try:
        _make_api_request("POST", url, api_key, headers=headers, json=data, timeout=120) # Timeout per la richiesta di trigger
        # Se _make_api_request non lancia eccezioni, la richiesta è stata accettata
        print("Richiesta di parsing inviata con successo.")
        return True
    except (requests.exceptions.RequestException, requests.exceptions.HTTPError):
        print(f"Fallimento nell'attivare il parsing per gli ID documento: {doc_ids}.")
        return False

# --- Main Script ---
if __name__ == "__main__":
    print("--- Avvio Script Caricamento Documenti RAGFlow ---")
    start_time = time.time()

    # 1. Elenca i file PDF locali
    print(f"\n1. Scansione directory locale: {PDF_DIRECTORY}")
    local_pdf_files = list_pdf_files(PDF_DIRECTORY)

    if not local_pdf_files:
        print("Nessun file PDF trovato nella directory specificata. Uscita.")
        exit()
    else:
        print(f"Trovati {len(local_pdf_files)} file PDF locali.")

    # 2. Inizializza dettagli API
    # L'URL base è già corretto dalla configurazione
    api_base_url = RAGFLOW_API_BASE_URL
    api_key = RAGFLOW_API_KEY
    print(f"Utilizzo API RAGFlow: {api_base_url}")

    # 3. Assicura l'esistenza del Knowledge Base e ottieni l'ID
    print(f"\n2. Verifica/Crea Knowledge Base: '{KNOWLEDGE_BASE_NAME}'")
    kb_id = create_ragflow_knowledge_base(api_base_url, api_key, KNOWLEDGE_BASE_NAME)

    if not kb_id:
        print("Impossibile creare o recuperare l'ID del Knowledge Base. L'operazione non può continuare.")
        exit()
    print(f"Utilizzo Knowledge Base ID: {kb_id}")

    # 4. Elenca i documenti già presenti nel Knowledge Base
    print(f"\n3. Controllo file esistenti nel Knowledge Base...")
    existing_documents_list = list_documents_in_ragflow(api_base_url, api_key, kb_id)

    if existing_documents_list is None:
        print("Attenzione: Impossibile recuperare l'elenco dei documenti esistenti. Non è possibile saltare i duplicati.")
        # Decidi se continuare o fermarti. Continuare caricherà tutto.
        # Per sicurezza, usciamo:
        print("Uscita per evitare potenziali duplicati.")
        exit()
        # existing_document_names = set() # Se si volesse continuare caricando tutto
    else:
        # Crea un set dei nomi dei file esistenti per un controllo veloce
        existing_document_names = {doc.get("name") for doc in existing_documents_list if doc.get("name")}
        print(f"Controllo completato. {len(existing_document_names)} documenti già presenti.")


    # 5. Filtra i file locali: identifica quelli da caricare e quelli da saltare
    files_to_upload = []
    files_skipped = 0
    print("\n4. Identificazione file da caricare...")
    for filepath in local_pdf_files:
        filename = os.path.basename(filepath)
        if filename in existing_document_names:
            # Messaggio opzionale per ogni file saltato (può essere molto verboso)
            # print(f"   - Saltato: '{filename}' (già esistente)")
            files_skipped += 1
        else:
            files_to_upload.append(filepath)

    if files_skipped > 0:
         print(f"   {files_skipped} file locali sono già presenti nel Knowledge Base e verranno saltati.")

    if not files_to_upload:
        print("\nNessun nuovo file da caricare. Tutti i PDF locali sono già nel Knowledge Base.")
    else:
        # 6. Carica i nuovi file
        total_files_to_process = len(files_to_upload)
        print(f"\n5. Inizio caricamento di {total_files_to_process} nuovi file PDF...")
        uploaded_doc_ids = []
        upload_errors = 0

        for idx, pdf_filepath in enumerate(files_to_upload):
            filename = os.path.basename(pdf_filepath)
            # Indicatore di progresso
            print(f"   [{idx + 1}/{total_files_to_process}] Caricamento: {filename}...")

            document_id = upload_pdf_to_ragflow(api_base_url, api_key, kb_id, pdf_filepath)

            if document_id:
                print(f"      => Caricato con successo (Doc ID: {document_id})")
                uploaded_doc_ids.append(document_id)
            else:
                print(f"      => !!! ERRORE nel caricamento di '{filename}' !!!")
                upload_errors += 1
                # Puoi decidere di fermare lo script al primo errore:
                # print("Interruzione dello script a causa di un errore di upload.")
                # exit()

        print(f"\n--- Caricamento completato ---")
        print(f"   File caricati con successo: {len(uploaded_doc_ids)}")
        if upload_errors > 0:
            print(f"   Errori durante il caricamento: {upload_errors} file")

        # 7. Attiva il parsing per i documenti appena caricati
        if uploaded_doc_ids:
            print("\n6. Attivazione parsing per i documenti caricati...")
            # L'API di parsing accetta una lista di ID
            if parse_documents_in_ragflow(api_base_url, api_key, uploaded_doc_ids):
                print("   Richiesta di parsing inviata. Il processo avviene in background su RAGFlow.")
            else:
                print("   !!! ERRORE nell'invio della richiesta di parsing. Controllare i log precedenti.")
        elif upload_errors == total_files_to_process:
             print("\nNessun file caricato con successo, parsing non attivato.")
        # Se non ci sono errori ma nessun file caricato (perché erano tutti duplicati),
        # non c'è bisogno di un messaggio specifico qui.

    # Fine script
    end_time = time.time()
    print(f"\n--- Operazione completata in {end_time - start_time:.2f} secondi ---")