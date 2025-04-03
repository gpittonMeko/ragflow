import os
import PyPDF2
from ragflow_sdk import RAGFlow

def pdf_to_text(filepath: str) -> str:
    """
    Legge il PDF con PyPDF2 e restituisce il testo estratto.
    Se non riesce a leggerlo, solleva eccezione.
    """
    text_list = []
    with open(filepath, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text_list.append(page_text)
    return "\n".join(text_list)

def load_pdf_as_text_file_on_ragflow(
    dataset,
    filename: str,
    text_content: str,
    chunk_method: str = "naive"
):
    """
    Carica su RAGFlow un documento di testo (invece di un PDF binario).
    Usa 'filename' come display_name, ma con estensione .txt per evitare che RAGFlow
    lo interpreti come PDF.
    chunk_method = "naive" per lo split automatico del testo,
                   "manual" se vuoi aggiungere chunk in un secondo momento.
    """
    # Costruiamo un doc "finto" .txt
    doc_info = {
        "display_name": filename.replace(".pdf", ".txt"),
        "blob": text_content.encode("utf-8"),  # convertiamo la stringa in byte
        "chunk_method": chunk_method,
        "parser_config": {
            "chunk_token_num": 128, 
            "delimiter":"\n!?;。；！？",
            "html4excel": False,
            "layout_recognize": True,
            "raptor":{"user_raptor":False}
        }
    }
    dataset.upload_documents(document_list=[doc_info])


def main(
    api_key: str,
    base_url: str,
    dataset_name: str,
    folder_path: str
):
    # 1. Inizializza RAGFlow
    rag_obj = RAGFlow(api_key=api_key, base_url=base_url)
    
    # 2. Trova dataset esistente
    ds_list = rag_obj.list_datasets(name=dataset_name)
    if not ds_list:
        print(f"[ERRORE] Dataset '{dataset_name}' non trovato. Crealo prima.")
        return
    dataset = ds_list[0]
    print(f"[INFO] Uso dataset '{dataset.name}' (ID={dataset.id}), chunk_method={dataset.chunk_method}")

    # 3. Scansiona la cartella in cerca di PDF
    all_files = os.listdir(folder_path)
    pdf_files = [f for f in all_files if f.lower().endswith(".pdf")]
    total_pdf = len(pdf_files)
    print(f"[INFO] Trovati {total_pdf} file PDF nella cartella '{folder_path}'.")

    if total_pdf == 0:
        print("[ATTENZIONE] Nessun PDF trovato. Esco.")
        return

    # 4. Elabora i PDF uno per uno (o a blocchi, se preferisci)
    for idx, pdf_name in enumerate(pdf_files, start=1):
        pdf_path = os.path.join(folder_path, pdf_name)
        print(f"\n[INFO] ({idx}/{total_pdf}) Leggo PDF localmente: {pdf_name}")

        # 4.1 Converte in testo con PyPDF2
        try:
            text_str = pdf_to_text(pdf_path)
            if not text_str.strip():
                print(f"[ATTENZIONE] PDF '{pdf_name}' sembra vuoto. Lo salto.")
                continue
        except Exception as e:
            print(f"[ERRORE] Impossibile estrarre testo da '{pdf_name}': {e}")
            continue
        
        # 4.2 Carica il testo come .txt su RAGFlow, chunk_method=naive
        try:
            load_pdf_as_text_file_on_ragflow(
                dataset=dataset,
                filename=pdf_name,
                text_content=text_str,
                chunk_method="naive"   # oppure "manual" se non vuoi lo split automatico
            )
            print(f"[OK] Caricato su RAGFlow come testo: {pdf_name}")
        except Exception as ex:
            print(f"[ERRORE] Durante caricamento su RAGFlow di '{pdf_name}': {ex}")

    # 5. Infine, avvia parse asincrono su tutti i doc del dataset
    print("\n[INFO] Avvio parsing asincrono su tutti i documenti del dataset...")
    all_docs = dataset.list_documents(page=1, page_size=999999)
    doc_ids = [d.id for d in all_docs]
    if doc_ids:
        dataset.async_parse_documents(doc_ids)
        print("[INFO] Parsing avviato correttamente!")
    else:
        print("[ATTENZIONE] Nessun documento da parsificare.")

    print("[INFO] Fine processo. PDF caricati come testo, senza PDFium.")

# ==============================
# UTILIZZO
# ==============================
if __name__ == "__main__":
    # Parametri reali
    API_KEY = "ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm"
    BASE_URL = "http://sgailegal.it:9380"
    DATASET_NAME = "sentenze_1739462764_8500"
    FOLDER_PATH = "/home/ubuntu/LLM_14/LLM_14/data/sentenze"

    main(API_KEY, BASE_URL, DATASET_NAME, FOLDER_PATH)
