import os
import math
from ragflow_sdk import RAGFlow

try:
    from tqdm import tqdm
    USE_TQDM = True
except ImportError:
    USE_TQDM = False

def load_pdfs_in_batches(
    api_key: str,
    base_url: str,
    dataset_name: str,
    folder_path: str,
    batch_size: int = 1000
):
    """
    Carica i PDF presenti in 'folder_path' sul dataset 'dataset_name' di RAGFlow,
    suddividendo il caricamento in batch di dimensione 'batch_size'.
    Avvia il parsing asincrono su ciascun batch appena caricato.
    """
    print(f"[INFO] Inizializzo RAGFlow con base_url='{base_url}'...")
    rag_object = RAGFlow(api_key=api_key, base_url=base_url)
    print("[INFO] Client RAGFlow inizializzato.")

    # 1. Verifica se esiste già il dataset
    print(f"[INFO] Cerco dataset con nome '{dataset_name}'...")
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
    print(f"[INFO] Trovati {total_pdfs} file PDF nella cartella '{folder_path}'.")

    if total_pdfs == 0:
        print("[ATTENZIONE] Nessun PDF trovato. Interrompo.")
        return

    # 3. Calcolo il numero di batch totali
    total_batches = math.ceil(total_pdfs / batch_size)
    print(f"[INFO] Caricherò i PDF in {total_batches} batch da {batch_size} file ciascuno.")

    # 4. Ciclo su ciascun batch
    start_index = 0
    for batch_index in range(total_batches):
        end_index = min(start_index + batch_size, total_pdfs)
        batch_files = pdf_files[start_index:end_index]
        current_batch_size = len(batch_files)

        print(f"\n=== [BATCH {batch_index+1}/{total_batches}] "
              f"PDF dal {start_index} al {end_index-1} (tot {current_batch_size}) ===")

        # 4.1 Lettura dei PDF di questo batch
        documents_to_upload = []
        if USE_TQDM:
            iterator = tqdm(batch_files, desc="Lettura batch", unit="file", ncols=80)
        else:
            iterator = batch_files

        for i, filename in enumerate(iterator, start=1):
            file_path = os.path.join(folder_path, filename)
            if not USE_TQDM:
                print(f"  -> [{i}/{current_batch_size}] Lettura: {filename}")

            try:
                with open(file_path, "rb") as f:
                    blob_content = f.read()
                documents_to_upload.append({
                    "display_name": filename,
                    "blob": blob_content
                })
            except Exception as e:
                print(f"[ERRORE] Nella lettura di '{file_path}': {e}")

        # Se non ci sono file validi nel batch, passo oltre
        if not documents_to_upload:
            print("[ATTENZIONE] Nessun PDF valido nel batch. Passo al batch successivo.")
            start_index = end_index
            continue

        # 4.2 Caricamento PDF di questo batch
        print(f"[INFO] Inizio caricamento di {len(documents_to_upload)} PDF nel dataset '{dataset_name}'...")
        try:
            dataset.upload_documents(document_list=documents_to_upload)
            print("[INFO] Caricamento completato con successo!")
        except Exception as e:
            print(f"[ERRORE] durante l'upload dei PDF: {e}")
            start_index = end_index
            continue

        # 4.3 Recupera TUTTI i documenti nel dataset o filtra solo quelli appena caricati
        #    In questo esempio, per semplicità, parse tutto.
        print("[INFO] Recupero la lista di documenti dal dataset per il parsing...")
        try:
            all_docs = dataset.list_documents(page=1, page_size=100000)
            print(f"[INFO] Nel dataset ora ci sono {len(all_docs)} documenti totali.")
        except Exception as e:
            print(f"[ERRORE] nella lettura dei documenti dal dataset: {e}")
            start_index = end_index
            continue

        # Creiamo la lista degli ID per il parsing
        doc_ids = [doc.id for doc in all_docs]
        if not doc_ids:
            print("[ATTENZIONE] Non ci sono documenti da parsificare.")
            start_index = end_index
            continue

        # 4.4 Avvia il parsing asincrono
        print(f"[INFO] Avvio parsing asincrono su {len(doc_ids)} documenti (batch {batch_index+1}).")
        try:
            dataset.async_parse_documents(doc_ids)
            print("[INFO] Parsing asincrono avviato correttamente.")
        except Exception as e:
            print(f"[ERRORE] durante l'avvio del parsing: {e}")

        # 4.5 Avanza l'indice per il batch successivo
        start_index = end_index

    print("\n[INFO] Tutti i batch sono stati processati. Fine.")

# ============================
# ESEMPIO DI UTILIZZO
# ============================
if __name__ == "__main__":
    # Valori che ci hai fornito
    API_KEY = "ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm"
    BASE_URL = "http://sgailegal.it:9380"
    DATASET_NAME = "sentenze_1739462764_8500"
    FOLDER_PATH = "/home/ubuntu/LLM_14/LLM_14/data/sentenze"

    # Esegui con batch_size = 1000 (puoi regolare in base alla RAM)
    load_pdfs_in_batches(
        api_key=API_KEY,
        base_url=BASE_URL,
        dataset_name=DATASET_NAME,
        folder_path=FOLDER_PATH,
        batch_size=1000
    )
