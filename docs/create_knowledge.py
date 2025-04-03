import os
from ragflow_sdk import RAGFlow
import PyPDF2

def pdf_to_text(filepath: str) -> str:
    """
    Tenta di leggere il PDF con PyPDF2 e restituisce il testo.
    Se non è un PDF valido o è corrotto, genera eccezione.
    """
    text_pages = []
    with open(filepath, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            txt = page.extract_text()
            if txt:
                text_pages.append(txt)
    return "\n".join(text_pages)

def create_text_document_in_ragflow(dataset, filename: str, text_content: str):
    """
    Carica un documento di testo in RAGFlow (chunk_method='naive'), 
    così RAGFlow divide il testo in chunk automaticamente (senza PDFium).
    """
    doc_info = {
        "display_name": filename,  # usiamo lo stesso nome, ma puoi aggiungere .txt se vuoi
        "blob": text_content.encode("utf-8"),
        "chunk_method": "naive",
        "parser_config": {
            "chunk_token_num": 128,
            "delimiter": "\n!?;。；！？",
            "html4excel": False,
            "layout_recognize": True,
            "raptor": {"user_raptor": False}
        }
    }
    dataset.upload_documents(document_list=[doc_info])

def remove_empty_documents(dataset):
    """
    Elimina dal dataset i documenti con chunk_count=0.
    """
    all_docs = dataset.list_documents(page=1, page_size=999999)
    if not all_docs:
        return

    to_remove = [doc.id for doc in all_docs if doc.chunk_count == 0]
    if to_remove:
        print(f"[INFO] Rimuovo {len(to_remove)} documenti che hanno chunk_count=0...")
        dataset.delete_documents(ids=to_remove)

def main():
    # Parametri reali
    API_KEY = "ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm"
    BASE_URL = "http://sgailegal.it:9380"
    DATASET_NAME = "sentenze_1739462764_8500"
    FOLDER_PATH = "/home/ubuntu/LLM_14/LLM_14/data/sentenze"

    print(f"[INFO] Inizializzo RAGFlow con base_url='{BASE_URL}'...")
    rag = RAGFlow(api_key=API_KEY, base_url=BASE_URL)

    # 1. Recupero (senza modificare) il dataset
    ds_list = rag.list_datasets(name=DATASET_NAME)
    if not ds_list:
        print(f"[ERRORE] Dataset '{DATASET_NAME}' non trovato. Crealo prima.")
        return
    dataset = ds_list[0]
    print(f"[INFO] Uso dataset '{dataset.name}' (ID={dataset.id}), chunk_method={dataset.chunk_method}")

    # 2. Scansiona cartella PDF
    all_files = os.listdir(FOLDER_PATH)
    pdf_files = [f for f in all_files if f.lower().endswith(".pdf")]
    total_pdf = len(pdf_files)
    print(f"[INFO] Trovati {total_pdf} PDF in '{FOLDER_PATH}'.")

    if total_pdf == 0:
        print("[ATTENZIONE] Nessun PDF, esco.")
        return

    # 3. Per ogni PDF, verifichiamo e carichiamo come testo
    processed_count = 0
    for idx, pdfname in enumerate(pdf_files, start=1):
        pdf_path = os.path.join(FOLDER_PATH, pdfname)
        print(f"\n[INFO] ({idx}/{total_pdf}) Verifico/leggo: {pdfname}")

        try:
            text_data = pdf_to_text(pdf_path)
        except Exception as e:
            print(f"[ERRORE] '{pdfname}' non è un PDF valido o è corrotto: {e}")
            continue  # Salta il file

        text_data = text_data.strip()
        if not text_data:
            print(f"[ATTENZIONE] '{pdfname}' non contiene testo. Saltato.")
            continue

        # 3.2 Carica come doc di testo
        try:
            create_text_document_in_ragflow(dataset, pdfname.replace(".pdf", ".txt"), text_data)
            processed_count += 1
            print(f"[OK] Caricato come testo: {pdfname}")
        except Exception as ex:
            print(f"[ERRORE] Nel caricamento RAGFlow di '{pdfname}': {ex}")

    print(f"\n[INFO] Caricamento completato. {processed_count} PDF validi caricati come testo.")

    # 4. Rimuovo documenti con chunk_count=0
    print("[INFO] Pulizia documenti vuoti (chunk_count=0) nel dataset...")
    remove_empty_documents(dataset)

    # 5. Avvio parsing su TUTTI i documenti
    print("[INFO] Avvio parsing asincrono su tutti i doc del dataset...")
    all_docs = dataset.list_documents(page=1, page_size=999999)
    doc_ids = [d.id for d in all_docs]
    if doc_ids:
        dataset.async_parse_documents(doc_ids)
        print("[INFO] Parsing avviato correttamente!")
    else:
        print("[ATTENZIONE] Nessun documento trovato per il parsing.")

    print("[INFO] Fine. I PDF validi sono caricati come testo, i doc vuoti sono stati eliminati.")

if __name__ == "__main__":
    main()
