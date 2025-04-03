import os
from ragflow_sdk import RAGFlow

# Se vuoi usare la progress bar di tqdm:
try:
    from tqdm import tqdm
    USE_TQDM = True
except ImportError:
    # Se tqdm non è installato, imposta False
    USE_TQDM = False

def load_pdfs_to_dataset(
    api_key: str,
    base_url: str,
    dataset_name: str,
    folder_path: str
):
    """
    Carica tutti i file PDF da 'folder_path' sul dataset 'dataset_name' usando RAGFlow,
    con log di avanzamento. Avvia l'operazione di parsing asincrono sui documenti caricati.
    """

    print(f"[INFO] Inizializzo RAGFlow con base_url='{base_url}'...")
    rag_object = RAGFlow(api_key=api_key, base_url=base_url)
    print("[INFO] Client RAGFlow inizializzato.")

    # 1. Verifica se il dataset esiste
    print(f"[INFO] Cerco dataset con nome: '{dataset_name}'...")
    existing_datasets = rag_object.list_datasets(name=dataset_name)
    if existing_datasets:
        dataset = existing_datasets[0]
        print(f"[INFO] Dataset '{dataset_name}' trovato (ID={dataset.id}). Utilizzo dataset esistente.")
    else:
        print(f"[INFO] Dataset '{dataset_name}' non trovato. Lo creo ora...")
        dataset = rag_object.create_dataset(name=dataset_name)
        print(f"[INFO] Dataset '{dataset_name}' creato con successo (ID={dataset.id}).")

    # 2. Raccogli TUTTI i PDF nella cartella
    print(f"[INFO] Scansiono la cartella '{folder_path}' per cercare file .pdf...")
    all_files = os.listdir(folder_path)
    pdf_files = [f for f in all_files if f.lower().endswith('.pdf')]
    total_pdfs = len(pdf_files)
    print(f"[INFO] Trovati {total_pdfs} file PDF nella cartella.")

    if total_pdfs == 0:
        print("[ATTENZIONE] Nessun PDF trovato nella cartella. Interrompo.")
        return

    # 3. Lettura e preparazione dei PDF da caricare (con progress bar o log manuale)
    documents_to_upload = []
    print("[INFO] Inizio lettura dei PDF per creare la lista di upload...")
    
    if USE_TQDM:
        iterator = tqdm(pdf_files, desc="Lettura PDF", unit="file", ncols=80)
    else:
        iterator = pdf_files

    for i, filename in enumerate(iterator, start=1):
        file_path = os.path.join(folder_path, filename)
        # Se non usi tqdm, stampa manualmente la progressione
        if not USE_TQDM:
            print(f"  -> [{i}/{total_pdfs}] Lettura file: {filename}")

        try:
            with open(file_path, "rb") as f:
                blob_content = f.read()
            documents_to_upload.append({
                "display_name": filename,
                "blob": blob_content
            })
        except Exception as e:
            print(f"[ERRORE] Nella lettura di '{file_path}': {e}")

    # 4. Se dopo la lettura non ci sono PDF validi, interrompi
    if not documents_to_upload:
        print("[ATTENZIONE] Non ci sono PDF da caricare (forse c'erano errori in lettura?). Interrompo.")
        return

    # 5. Caricamento dei documenti nel dataset
    print(f"[INFO] Carico ora {len(documents_to_upload)} documenti PDF nel dataset '{dataset_name}'...")
    try:
        dataset.upload_documents(document_list=documents_to_upload)
        print("[INFO] Caricamento completato con successo!")
    except Exception as e:
        print(f"[ERRORE] durante l'upload dei PDF: {e}")
        return

    # 6. Recupera la lista di documenti caricati e avvia il parsing
    print("[INFO] Recupero la lista dei documenti dal dataset per avviare il parsing...")
    try:
        all_docs = dataset.list_documents(keywords=None, page=1, page_size=100000)
        print(f"[INFO] Nel dataset sono presenti {len(all_docs)} documenti totali.")
    except Exception as e:
        print(f"[ERRORE] nella lettura dei documenti dal dataset: {e}")
        return

    # Se vuoi parsificare TUTTI i documenti, prendiamone gli ID:
    doc_ids = [doc.id for doc in all_docs]
    if not doc_ids:
        print("[ATTENZIONE] Non ci sono documenti da parsificare.")
        return

    print(f"[INFO] Avvio parsing asincrono su {len(doc_ids)} documenti...")
    try:
        dataset.async_parse_documents(doc_ids)
        print("[INFO] Parsing asincrono avviato correttamente.")
    except Exception as e:
        print(f"[ERRORE] durante l'avvio del parsing: {e}")

# ============================
# ESEMPIO DI UTILIZZO
# ============================
if __name__ == "__main__":
    # Questi sono i parametri reali che hai fornito, li lasciamo invariati:
    API_KEY = "ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm"
    BASE_URL = "http://sgailegal.it:9380"
    DATASET_NAME = "sentenze_1739462764_8500"
    FOLDER_PATH = "/home/ubuntu/LLM_14/LLM_14/data/sentenze"

    load_pdfs_to_dataset(API_KEY, BASE_URL, DATASET_NAME, FOLDER_PATH)
