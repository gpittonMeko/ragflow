import os
from ragflow_sdk import RAGFlow
from ragflow_sdk.modules.dataset import DataSet  # se servisse parser_config
try:
    from tqdm import tqdm
    USE_TQDM = True
except ImportError:
    USE_TQDM = False

# (OPZIONALE) Se vuoi evitare PDF vuoti/corrotti, puoi usare PyPDF2
# pip install PyPDF2
# import PyPDF2

API_KEY = "<YOUR_API_KEY>"
BASE_URL = "http://<YOUR_BASE_URL>:9380"
DATASET_NAME = "nome_mio_dataset"  # Nome univoco del dataset
FOLDER_PATH = r"C:\miei_pdf"       # Cartella locale con PDF (e sottocartelle)
BATCH_SIZE = 30                    # Numero di PDF processati a ogni blocco

def create_or_get_dataset(ragflow: RAGFlow, dataset_name: str) -> DataSet:
    """
    Cerca un dataset con 'dataset_name' e chunk_method='naive'.
    Se non lo trova, lo crea con chunk_method='naive'.
    """
    existing = ragflow.list_datasets(name=dataset_name)
    if existing:
        ds = existing[0]
        print(f"[INFO] Dataset '{dataset_name}' esiste già (ID={ds.id}), chunk_method={ds.chunk_method}")
        # Se chunk_method non è naive e vuoi forzarlo, devi assicurarti chunk_count=0
        # ds.update({"chunk_method": "naive"})
        return ds
    else:
        print(f"[INFO] Creo dataset '{dataset_name}' con chunk_method='naive' ...")
        ds = ragflow.create_dataset(
            name=dataset_name,
            chunk_method="naive", 
            parser_config={"chunk_token_num":128,"delimiter":"\\n!?;。；！？","html4excel":False,"layout_recognize":True,"raptor":{"user_raptor":False}}
        )
        print(f"[INFO] Creato dataset (ID={ds.id}).")
        return ds

def scan_pdfs_recursively(folder_path: str):
    """
    Restituisce la lista di tutti i file .pdf all'interno di 'folder_path' (anche sottocartelle).
    """
    pdf_paths = []
    for root, dirs, files in os.walk(folder_path):
        for fname in files:
            if fname.lower().endswith(".pdf"):
                full_path = os.path.join(root, fname)
                pdf_paths.append(full_path)
    return pdf_paths

def is_pdf_valid(pdf_path):
    """
    (Opzionale) Controlla se il PDF non è vuoto/corrotto.
    Puoi rimuovere questa parte se non ti interessa lo skip di PDF problematici.
    """
    try:
        import PyPDF2
        with open(pdf_path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            # Se trovi almeno una pagina con testo > 0, lo consideriamo valido
            for page in reader.pages:
                txt = page.extract_text() or ""
                if txt.strip():
                    return True
        return False
    except ImportError:
        # PyPDF2 non installato, considera tutti i PDF validi
        return True
    except Exception as e:
        # Altri errori (PDF corrotto, etc.) - considera non valido
        print(f"[WARN] Errore validazione PDF '{os.path.basename(pdf_path)}': {e}")
        return False

def main():
    print(f"[INFO] Inizializzo RAGFlow con base_url='{BASE_URL}'...")
    ragflow = RAGFlow(api_key=API_KEY, base_url=BASE_URL)

    # 1) Crea o recupera dataset
    dataset = create_or_get_dataset(ragflow, DATASET_NAME)

    # 2) Scansiona la cartella
    pdf_paths = scan_pdfs_recursively(FOLDER_PATH)
    total_pdf = len(pdf_paths)
    print(f"[INFO] Trovati {total_pdf} file PDF in '{FOLDER_PATH}' e sottocartelle.")

    if total_pdf == 0:
        print("[ATTENZIONE] Nessun PDF trovato, esco.")
        return

    # 3) Lista documenti già presenti, per saltare duplicati
    existing_docs = dataset.list_documents(page=1, page_size=999999)
    existing_names = {doc.name for doc in existing_docs}
    print(f"[INFO] Dataset contiene già {len(existing_docs)} documenti.")

    # Barra di avanzamento globale
    if USE_TQDM:
        pbar_global = tqdm(total=total_pdf, desc="Elaborazione PDF", unit="pdf")
    else:
        pbar_global = None

    # 4) Carichiamo i PDF in blocchi di BATCH_SIZE
    uploaded_count = 0

    for start_i in range(0, total_pdf, BATCH_SIZE):
        end_i = min(start_i + BATCH_SIZE, total_pdf)
        batch_files = pdf_paths[start_i:end_i]
        print(f"\n=== [BATCH {start_i//BATCH_SIZE + 1}] PDF {start_i} -> {end_i - 1} (tot {len(batch_files)}) ===")

        # Barra per questo blocco
        if USE_TQDM:
            pbar_batch = tqdm(batch_files, desc="Carico blocco", leave=False, unit="pdf")
        else:
            pbar_batch = batch_files

        for pdf_full_path in pbar_batch:
            pdf_name = os.path.basename(pdf_full_path)

            if pbar_global:
                pbar_global.update(1)  # avanza

            # Se già presente, skip
            if pdf_name in existing_names:
                continue

            # (Opzionale) controlla se PDF ha testo
            if not is_pdf_valid(pdf_full_path):
                continue

            # Leggi in binario
            with open(pdf_full_path, "rb") as f:
                blob_content = f.read()

            # Carica
            doc_data = [{
                "display_name": pdf_name,
                "blob": blob_content
            }]
            try:
                result = dataset.upload_documents(document_list=doc_data)
                # Verifica che il documento sia stato effettivamente caricato
                if result and len(result) > 0:
                    existing_names.add(pdf_name)
                    uploaded_count += 1
                    if uploaded_count % 10 == 0:
                        print(f"[INFO] Caricati {uploaded_count} PDF finora...")
                else:
                    print(f"[ERRORE] '{pdf_name}' upload completato ma nessun documento restituito")
            except Exception as e:
                print(f"[ERRORE Upload] '{pdf_name}': {e}")
                import traceback
                traceback.print_exc()

    if pbar_global:
        pbar_global.close()

    print(f"\n[INFO] Caricamento completato. Inviati {uploaded_count} PDF nuovi al dataset '{DATASET_NAME}'.")

    # 5) Verifica documenti caricati
    print(f"\n[VERIFICA] Verifico documenti nel dataset...")
    try:
        all_docs_after = dataset.list_documents(page=1, page_size=999999)
        print(f"[INFO] Documenti totali nel dataset: {len(all_docs_after)}")
        
        # Conta documenti non parsati
        unparsed = [doc for doc in all_docs_after if getattr(doc, 'run', '') == 'UNSTART' or getattr(doc, 'chunk_count', 0) == 0]
        if unparsed:
            print(f"[INFO] Documenti da parsare: {len(unparsed)}")
    except Exception as e:
        print(f"[ERRORE] Errore verifica documenti: {e}")
        all_docs_after = []

    # 6) Avvia parse asincrono su TUTTI i documenti, se vuoi
    #    (chunk_method='naive' => parsing automatico con PDFium)
    all_ids = [doc.id for doc in all_docs_after]
    if all_ids:
        try:
            dataset.async_parse_documents(all_ids)
            print(f"[INFO] Parsing asincrono avviato su {len(all_ids)} documenti!")
        except Exception as e:
            print(f"[ERRORE] Errore avvio parsing: {e}")
            import traceback
            traceback.print_exc()
    else:
        print("[ATTENZIONE] Nessun documento nel dataset, niente parsing.")

    print("[INFO] Fine script. I PDF sono stati caricati e parse avviato (se naive).")

if __name__ == "__main__":
    main()
