import os
import math
import re
from ragflow_sdk import RAGFlow

try:
    from tqdm import tqdm
    USE_TQDM = True
except ImportError:
    USE_TQDM = False

def load_pdfs_in_small_batches_skip_errors(
    api_key: str,
    base_url: str,
    dataset_name: str,
    folder_path: str,
    batch_size: int = 30
):
    """
    Carica PDF in un dataset RAGFlow *senza cambiare chunk_method* (es. naive),
    suddividendo il caricamento in piccoli batch da 'batch_size'.
    Se alcuni PDF generano l'errore 'Data format error' con PDFium,
    lo script li scarta e prosegue col caricamento dei restanti.
    Poi, per ogni batch, avvia il parsing asincrono.
    """

    print(f"[INFO] Inizializzo RAGFlow con base_url='{base_url}'...")
    rag_object = RAGFlow(api_key=api_key, base_url=base_url)
    print("[INFO] Client RAGFlow inizializzato.")

    # 1. Recupera il dataset (senza modificarlo)
    print(f"[INFO] Cerco dataset '{dataset_name}' (senza forzare chunk_method).")
    existing = rag_object.list_datasets(name=dataset_name)
    if not existing:
        print(f"[ERRORE] Il dataset '{dataset_name}' non esiste. Crealo prima con chunk_method=naive, se necessario.")
        return

    dataset = existing[0]
    print(f"[INFO] Trovato dataset '{dataset_name}' (ID={dataset.id}), chunk_method={dataset.chunk_method}")

    # 2. Leggi tutti i PDF dalla cartella
    all_files = os.listdir(folder_path)
    pdf_files = [f for f in all_files if f.lower().endswith('.pdf')]
    total_pdfs = len(pdf_files)
    print(f"[INFO] Nella cartella '{folder_path}' trovati {total_pdfs} PDF totali.")

    if total_pdfs == 0:
        print("[ATTENZIONE] Nessun PDF, esco.")
        return

    # 3. Calcolo batch totali
    total_batches = math.ceil(total_pdfs / batch_size)
    print(f"[INFO] Processerò i PDF in {total_batches} batch da {batch_size} file ciascuno.")

    start_index = 0
    for batch_i in range(total_batches):
        end_index = min(start_index + batch_size, total_pdfs)
        batch_files = pdf_files[start_index:end_index]
        current_batch_count = len(batch_files)

        print(f"\n=== [BATCH {batch_i+1}/{total_batches}] ===")
        print(f"[INFO] Indice PDF: {start_index} -> {end_index-1} (tot {current_batch_count}).")

        # 3.1 Leggi i PDF in memoria
        documents_to_upload = []
        iterator = tqdm(batch_files, desc="Lettura batch", unit="file") if USE_TQDM else batch_files

        for f_name in iterator:
            f_path = os.path.join(folder_path, f_name)
            try:
                with open(f_path, "rb") as f:
                    blob = f.read()
                documents_to_upload.append({
                    "display_name": f_name,
                    "blob": blob
                })
            except Exception as e:
                print(f"[ERRORE] Lettura file '{f_name}': {e}")

        if not documents_to_upload:
            print("[ATTENZIONE] Batch vuoto (o con errori in lettura). Passo oltre.")
            start_index = end_index
            continue

        # 3.2 Prova ad uploadare. Se compaiono errori di PDFium, rimuovi i PDF incriminati e ritenta
        docs_to_upload_ok = documents_to_upload[:]  # copia

        while True:
            if not docs_to_upload_ok:
                print("[ATTENZIONE] Tutti i PDF di questo batch erano corrotti. Batch saltato.")
                break

            try:
                print(f"[INFO] Upload di {len(docs_to_upload_ok)} PDF sul dataset '{dataset_name}'...")
                dataset.upload_documents(document_list=docs_to_upload_ok)
                print("[INFO] Upload completato con successo!")
                break  # esci dal while, perché l'upload è andato a buon fine

            except Exception as e:
                msg = str(e)
                print(f"[ERRORE] upload_documents ha generato eccezione: {msg}")

                # Trova i PDF con 'Data format error' menzionati nell'errore
                # Spesso l'errore appare con la forma:
                # Sentenza_XXX_YYYY.pdf: Failed to load document (PDFium: Data format error).
                # Quindi usiamo una regex per estrarre i nomi file in errore
                pattern = r"([^\s]+\.pdf): Failed to load document \(PDFium: Data format error\)"
                bad_files = re.findall(pattern, msg)
                bad_files = set(bad_files)  # per evitare duplicati

                if not bad_files:
                    print("[ERRORE] Non ho trovato PDF in errore 'Data format error' da escludere. Interrompo qui.")
                    # Non possiamo risolvere l'errore => usciamo dal while e dal batch
                    break

                # Rimuovo i PDF corrotti da docs_to_upload_ok
                print(f"[INFO] Rimuovo {len(bad_files)} PDF corrotti e ritento l'upload del batch rimanente...")
                new_list = []
                for doc_info in docs_to_upload_ok:
                    fname = doc_info.get("display_name", "")
                    if fname in bad_files:
                        print(f"  -> Skippato '{fname}' (Data format error).")
                    else:
                        new_list.append(doc_info)
                docs_to_upload_ok = new_list

                # e si ripete il while True con un batch ridotto

        # Se dopo vari tentativi ho caricato almeno un PDF, avvio parsing
        if docs_to_upload_ok:
            # 3.3 Recupero i documenti e avvio parsing
            try:
                all_docs = dataset.list_documents(page=1, page_size=100000)
                doc_ids = [d.id for d in all_docs]
                print(f"[INFO] Nel dataset ci sono ora {len(all_docs)} documenti totali.")
                if doc_ids:
                    print(f"[INFO] Avvio parsing asincrono su {len(doc_ids)} documenti.")
                    dataset.async_parse_documents(doc_ids)
                    print("[INFO] Parsing avviato correttamente.")
            except Exception as e:
                print(f"[ERRORE] Non riesco a lanciare o recuperare documenti per parsing: {e}")

        # Avanziamo al prossimo batch
        start_index = end_index

    print("\n[INFO] Fine caricamento a batch con skip PDF corrotti.")

# =============== ESEMPIO DI UTILIZZO ===============
if __name__ == "__main__":
    API_KEY = "ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm"
    BASE_URL = "http://sgailegal.it:9380"
    DATASET_NAME = "sentenze_1739462764_8500"
    FOLDER_PATH = "/home/ubuntu/LLM_14/LLM_14/data/sentenze"

    # Carichiamo 30 PDF per volta e scartiamo quelli con 'Data format error'
    load_pdfs_in_small_batches_skip_errors(
        api_key=API_KEY,
        base_url=BASE_URL,
        dataset_name=DATASET_NAME,
        folder_path=FOLDER_PATH,
        batch_size=30
    )
