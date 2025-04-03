import os
import math
from ragflow_sdk import RAGFlow

try:
    from tqdm import tqdm
    USE_TQDM = True
except ImportError:
    USE_TQDM = False

def load_pdfs_in_small_batches(
    api_key: str,
    base_url: str,
    dataset_name: str,
    folder_path: str,
    batch_size: int = 30
):
    """
    Carica e parsifica i PDF presenti in 'folder_path' sul dataset 'dataset_name' di RAGFlow,
    suddividendo il caricamento in batch di dimensione 'batch_size'.
    Ogni batch viene immediatamente parsificato.
    """

    print(f"[INFO] Inizializzo RAGFlow con base_url='{base_url}'...")
    rag_object = RAGFlow(api_key=api_key, base_url=base_url)
    print("[INFO] Client RAGFlow inizializzato.")

    # 1. Trova (o crea) il dataset
    print(f"[INFO] Cerco dataset con nome '{dataset_name}'...")
    existing = rag_object.list_datasets(name=dataset_name)
    if existing:
        dataset = existing[0]
        print(f"[INFO] Dataset '{dataset_name}' trovato (ID={dataset.id}).")
    else:
        print(f"[INFO] Dataset '{dataset_name}' non trovato. Lo creo...")
        dataset = rag_object.create_dataset(name=dataset_name)
        print(f"[INFO] Dataset creato con successo (ID={dataset.id}).")

    # 2. Lista di TUTTI i PDF nella cartella
    print(f"[INFO] Scansiono la cartella '{folder_path}' per cercare .pdf...")
    all_files = os.listdir(folder_path)
    pdf_files = [f for f in all_files if f.lower().endswith('.pdf')]
    total_pdfs = len(pdf_files)
    print(f"[INFO] Trovati {total_pdfs} PDF totali.")

    if total_pdfs == 0:
        print("[ATTENZIONE] Nessun PDF trovato. Esco.")
        return

    # 3. Calcolo quante tornate di batch serviranno
    total_batches = math.ceil(total_pdfs / batch_size)
    print(f"[INFO] Caricherò i PDF in {total_batches} batch da {batch_size} file ciascuno.")

    # 4. Processa i PDF a blocchi di dimensione batch_size
    start_index = 0
    for batch_i in range(total_batches):
        end_index = min(start_index + batch_size, total_pdfs)
        batch_files = pdf_files[start_index:end_index]
        current_batch_size = len(batch_files)

        print(f"\n=== [BATCH {batch_i+1}/{total_batches}] ===")
        print(f"[INFO] Indice PDF {start_index} -> {end_index - 1} (tot {current_batch_size}).")

        # 4.1 Lettura PDF del batch
        documents_to_upload = []
        if USE_TQDM:
            iterator = tqdm(batch_files, desc="Lettura batch", unit="file", ncols=80)
        else:
            iterator = batch_files

        for j, filename in enumerate(iterator, start=1):
            file_path = os.path.join(folder_path, filename)
            if not USE_TQDM:
                print(f"  -> [{j}/{current_batch_size}] Lettura: {filename}")

            try:
                with open(file_path, "rb") as f:
                    blob_content = f.read()
                documents_to_upload.append({
                    "display_name": filename,
                    "blob": blob_content
                })
            except Exception as e:
                print(f"[ERRORE] Lettura '{file_path}': {e}")

        if not documents_to_upload:
            print("[ATTENZIONE] Nessun file valido in questo batch. Salto.")
            start_index = end_index
            continue

        # 4.2 Caricamento del batch
        print(f"[INFO] Carico {len(documents_to_upload)} PDF nel dataset '{dataset_name}'...")
        try:
            dataset.upload_documents(document_list=documents_to_upload)
            print("[INFO] Caricamento completato con successo!")
        except Exception as e:
            print(f"[ERRORE] durante l'upload dei PDF: {e}")
            # Passa comunque al prossimo batch
            start_index = end_index
            continue

        # 4.3 Recupero documenti caricati (oppure TUTTI, in base alle esigenze)
        #     In questo esempio, parse l'intero dataset per semplicità.
        print("[INFO] Recupero la lista di TUTTI i documenti dal dataset...")
        try:
            all_docs = dataset.list_documents(page=1, page_size=100000)
            print(f"[INFO] Documento totali nel dataset: {len(all_docs)}")
        except Exception as e:
            print(f"[ERRORE] nella lettura dei documenti dal dataset: {e}")
            start_index = end_index
            continue

        doc_ids = [d.id for d in all_docs]
        if not doc_ids:
            print("[ATTENZIONE] Nessun documento da parsificare in dataset.")
            start_index = end_index
            continue

        # 4.4 Parsing asincrono
        print(f"[INFO] Avvio parsing asincrono su {len(doc_ids)} documenti...")
        try:
            dataset.async_parse_documents(doc_ids)
            print("[INFO] Parsing asincrono avviato con successo.")
        except Exception as e:
            print(f"[ERRORE] nell'avvio del parsing: {e}")

        # 4.5 Avanza al prossimo batch
        start_index = end_index

    print("\n[INFO] Fine del caricamento a batch e parsing.")

# ============================
# ESEMPIO DI UTILIZZO
# ============================
if __name__ == "__main__":
    API_KEY = "ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm"
    BASE_URL = "http://sgailegal.it:9380"
    DATASET_NAME = "sentenze_1739462764_8500"
    FOLDER_PATH = "/home/ubuntu/LLM_14/LLM_14/data/sentenze"

    # Batch di 30 PDF
    load_pdfs_in_small_batches(
        api_key=API_KEY,
        base_url=BASE_URL,
        dataset_name=DATASET_NAME,
        folder_path=FOLDER_PATH,
        batch_size=30
    )
