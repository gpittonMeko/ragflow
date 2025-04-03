import os
import math
from ragflow_sdk import RAGFlow

# (Opzionale) Se vuoi la barra di progresso
try:
    from tqdm import tqdm
    USE_TQDM = True
except ImportError:
    USE_TQDM = False

def load_pdfs_in_small_batches_no_pdfium(
    api_key: str,
    base_url: str,
    dataset_name: str,
    folder_path: str,
    batch_size: int = 30
):
    """
    Carica PDF in un dataset RAGFlow con `chunk_method='manual'` (quindi niente parsing PDFium).
    Ogni batch di dimensione 'batch_size' viene caricato a parte
    per evitare che la richiesta sia troppo grande (413 error).
    """

    print(f"[INFO] Creo/Recupero un dataset con chunk_method='manual' per NON usare PDFium.")
    rag_object = RAGFlow(api_key=api_key, base_url=base_url)

    # 1. Trova dataset; se non esiste, lo creo con chunk_method='manual'
    existing_datasets = rag_object.list_datasets(name=dataset_name)
    if existing_datasets:
        dataset = existing_datasets[0]
        print(f"[INFO] Dataset '{dataset_name}' esistente (ID={dataset.id}).")

        # Se vuoi forzare chunk_method='manual' su un dataset esistente,
        # devi assicurarti che non contenga chunk (chunk_count = 0).
        # Altrimenti genererà un errore. Esempio:
        if dataset.chunk_method != "manual":
            print(f"[INFO] Dataset esistente con chunk_method={dataset.chunk_method}. Provo a forzare 'manual'...")
            # Verifica chunk_count == 0
            # Altrimenti non puoi cambiare chunk_method
            all_docs = dataset.list_documents(page=1, page_size=10)
            total_chunks = sum(doc.chunk_count for doc in all_docs)
            if total_chunks > 0:
                print("[ERRORE] Il dataset ha già chunk. Non puoi cambiare chunk_method se chunk_count > 0.")
                print("Crea un nuovo dataset oppure cancella i documenti esistenti.")
                return
            # Se chunk_count=0, allora puoi cambiare:
            dataset.update({"chunk_method": "manual"})
            print(f"[INFO] Impostato chunk_method='manual' con successo. Ora PDFium NON verrà usato.")
    else:
        # Creo un dataset ex-novo con chunk_method='manual'
        print(f"[INFO] Creo un nuovo dataset '{dataset_name}' con chunk_method='manual'...")
        dataset = rag_object.create_dataset(
            name=dataset_name,
            chunk_method="manual",
            parser_config={"raptor": {"user_raptor": False}}  # config base per "manual"
        )
        print(f"[INFO] Dataset creato (ID={dataset.id}). PDFium disabilitato.")

    # 2. Raccogli i PDF
    print(f"[INFO] Cerco i file .pdf in '{folder_path}'...")
    all_files = os.listdir(folder_path)
    pdf_files = [f for f in all_files if f.lower().endswith('.pdf')]
    total_pdfs = len(pdf_files)
    print(f"[INFO] Trovati {total_pdfs} PDF totali.")

    if total_pdfs == 0:
        print("[ATTENZIONE] Nessun PDF trovato, esco.")
        return

    # 3. Batch
    total_batches = math.ceil(total_pdfs / batch_size)
    print(f"[INFO] Eseguo caricamento in {total_batches} batch da {batch_size} file ciascuno.")

    start_index = 0
    for batch_i in range(total_batches):
        end_index = min(start_index + batch_size, total_pdfs)
        batch_files = pdf_files[start_index:end_index]
        current_batch_size = len(batch_files)

        print(f"\n=== BATCH {batch_i+1}/{total_batches}: Indice {start_index} -> {end_index-1}, tot {current_batch_size} ===")
        
        # Lettura in memoria
        docs_to_upload = []
        iterator = tqdm(batch_files, desc="Caricamento batch", unit="file") if USE_TQDM else batch_files

        for filename in iterator:
            file_path = os.path.join(folder_path, filename)
            try:
                with open(file_path, "rb") as f:
                    blob = f.read()
                docs_to_upload.append({
                    "display_name": filename,
                    "blob": blob
                })
            except Exception as e:
                print(f"[ERRORE] Lettura '{filename}': {e}")

        # Se non ci sono file validi, passo al prossimo batch
        if not docs_to_upload:
            print("[ATTENZIONE] Nessun file caricato in questo batch.")
            start_index = end_index
            continue

        # Upload
        print(f"[INFO] Carico {len(docs_to_upload)} PDF su dataset '{dataset_name}' (chunk_method='manual')...")
        try:
            dataset.upload_documents(document_list=docs_to_upload)
            print("[INFO] Upload completato. (Nessun parsing PDFium in corso).")
        except Exception as e:
            print(f"[ERRORE] durante l'upload dei PDF: {e}")

        # Poiché chunk_method='manual', RAGFlow NON parse i PDF, non li spezza in chunk
        # e non invoca PDFium. Questi PDF rimangono semplici BLOB binari.
        # Se vuoi aggiungere chunk manualmente, dovrai farlo tu con doc.add_chunk(...).

        # Avanzamento
        start_index = end_index

    print("\n[INFO] Fine. Tutti i batch caricati senza passare per PDFium.")


if __name__ == "__main__":
    API_KEY = "ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm"
    BASE_URL = "http://sgailegal.it:9380"
    DATASET_NAME = "sentenze_1739462764_8500"
    FOLDER_PATH = "/home/ubuntu/LLM_14/LLM_14/data/sentenze"

    load_pdfs_in_small_batches_no_pdfium(
        api_key=API_KEY,
        base_url=BASE_URL,
        dataset_name=DATASET_NAME,
        folder_path=FOLDER_PATH,
        batch_size=30
    )
