import os
from ragflow_sdk import RAGFlow

def load_pdfs_to_dataset(
    api_key: str,
    base_url: str,
    dataset_name: str,
    folder_path: str
):
    """
    Carica tutti i file PDF da 'folder_path' sul dataset 'dataset_name' usando RAGFlow,
    e avvia l'operazione di parsing asincrono sui documenti appena caricati.
    """

    print(f"[INFO] Inizializzazione RAGFlow con base_url={base_url}")
    rag_object = RAGFlow(api_key=api_key, base_url=base_url)
    print("[INFO] Client RAGFlow inizializzato.")

    # 1. Verifica se esiste già il dataset
    print(f"[INFO] Cerco dataset con nome: '{dataset_name}'...")
    existing_datasets = rag_object.list_datasets(name=dataset_name)
    if existing_datasets:
        dataset = existing_datasets[0]
        print(f"[INFO] Dataset '{dataset_name}' trovato (ID={dataset.id}). Utilizzo dataset esistente.")
    else:
        print(f"[INFO] Dataset '{dataset_name}' non trovato. Lo creo ora...")
        dataset = rag_object.create_dataset(name=dataset_name)
        print(f"[INFO] Dataset '{dataset_name}' creato con successo (ID={dataset.id}).")

    # 2. Prepara la lista dei documenti da caricare
    print(f"[INFO] Scansiono la cartella: '{folder_path}' per cercare file .pdf...")
    documents_to_upload = []
    for filename in os.listdir(folder_path):
        if filename.lower().endswith('.pdf'):
            file_path = os.path.join(folder_path, filename)
            print(f"  - Trovato PDF: {filename}")
            try:
                with open(file_path, "rb") as f:
                    blob_content = f.read()
                documents_to_upload.append({
                    "display_name": filename,
                    "blob": blob_content
                })
            except Exception as e:
                print(f"[ERRORE] Nella lettura di '{file_path}': {e}")

    if not documents_to_upload:
        print("[ATTENZIONE] Nessun PDF trovato nella cartella specificata. Interrompo il processo.")
        return
    
    # 3. Carica i documenti nel dataset
    print(f"[INFO] Inizio caricamento di {len(documents_to_upload)} PDF nel dataset '{dataset_name}'...")
    try:
        dataset.upload_documents(document_list=documents_to_upload)
        print(f"[INFO] Caricati {len(documents_to_upload)} documenti PDF nel dataset '{dataset_name}'.")
    except Exception as e:
        print(f"[ERRORE] durante l'upload dei PDF: {e}")
        return

    # 4. Recupera la lista dei documenti caricati per avviare il parsing
    print("[INFO] Recupero la lista dei documenti nel dataset, per avviare il parsing...")
    try:
        all_docs = dataset.list_documents(
            keywords=None,
            page=1,
            page_size=1000  # alziamo la pagina massima
        )
        print(f"[INFO] Trovati {len(all_docs)} documenti totali nel dataset.")
    except Exception as e:
        print(f"[ERRORE] nella lettura dei documenti nel dataset: {e}")
        return

    # Crea una lista di ID dei documenti
    doc_ids = [doc.id for doc in all_docs]
    if not doc_ids:
        print("[ATTENZIONE] Non sono stati trovati documenti da parsificare.")
        return

    # 5. Avvia l'operazione di parsing asincrono su tutti i documenti
    print(f"[INFO] Avvio parsing asincrono per {len(doc_ids)} documenti...")
    try:
        dataset.async_parse_documents(doc_ids)
        print("[INFO] Parsing asincrono avviato correttamente.")
    except Exception as e:
        print(f"[ERRORE] durante l'avvio del parsing dei documenti: {e}")

# ============================
# ESEMPIO DI UTILIZZO
# ============================
if __name__ == "__main__":
    # Sostituisci <YOUR_API_KEY> e <YOUR_BASE_URL> con i tuoi parametri reali
    API_KEY = "ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm"
    BASE_URL = "http://sgailegal.it:9380"

    # Nome della knowledge base (dataset)
    DATASET_NAME = "sentenze_1739462764_8500"

    # Cartella locale in cui risiedono i file PDF
    FOLDER_PATH = "/home/ubuntu/LLM_14/LLM_14/data/sentenze"

    # Richiama la funzione per caricare i PDF e avviare il parsing
    load_pdfs_to_dataset(API_KEY, BASE_URL, DATASET_NAME, FOLDER_PATH)
