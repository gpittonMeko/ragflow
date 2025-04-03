import os
import math
from ragflow_sdk import RAGFlow
import PyPDF2

def pdf_to_text(filepath: str) -> str:
    """
    Converte il PDF in testo usando PyPDF2.
    Restituisce l'intero contenuto come stringa.
    """
    text_content = []
    with open(filepath, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        # PyPDF2.PdfReader ha l'attributo .pages con il testo pagina per pagina
        num_pages = len(reader.pages)
        for page_i in range(num_pages):
            page = reader.pages[page_i]
            text = page.extract_text()
            if text:
                text_content.append(text)
    return "\n".join(text_content)

def load_pdfs_with_local_parsing(
    api_key: str,
    base_url: str,
    dataset_name: str,
    folder_path: str,
    chunk_size: int = 2000
):
    """
    Esegue:
      - Lettura locale dei PDF (senza PDFium) con PyPDF2;
      - Crea un doc in RAGFlow con chunk_method='manual' per ciascun PDF;
      - Suddivide il testo in chunk di `chunk_size` caratteri e li aggiunge al doc via doc.add_chunk(...).
    """
    # 1) Inizializza RAGFlow
    rag_object = RAGFlow(api_key=api_key, base_url=base_url)

    # 2) Trova o crea il dataset (chunk_method NON conta, tanto creeremo doc 'manual' a livello di doc)
    existing = rag_object.list_datasets(name=dataset_name)
    if existing:
        dataset = existing[0]
        print(f"[INFO] Uso dataset esistente: {dataset.name} (ID={dataset.id}).")
    else:
        # Se preferisci, puoi creare un dataset con chunk_method="naive",
        # ma essendo che forziamo 'manual' a livello doc, PDFium non verrà usato.
        print(f"[INFO] Creo dataset '{dataset_name}' con chunk_method='naive' (o 'manual').")
        dataset = rag_object.create_dataset(
            name=dataset_name,
            chunk_method="naive"
        )

    # 3) Scansiona cartella per i PDF
    all_files = os.listdir(folder_path)
    pdf_files = [f for f in all_files if f.lower().endswith('.pdf')]
    total_pdf = len(pdf_files)
    print(f"[INFO] Trovati {total_pdf} PDF in '{folder_path}'.")

    if total_pdf == 0:
        print("[ATTENZIONE] Nessun PDF da processare, esco.")
        return

    # 4) Per ciascun PDF, estrai testo e crea doc 'manual'
    for i, pdfname in enumerate(pdf_files, start=1):
        pdfpath = os.path.join(folder_path, pdfname)
        print(f"\n[INFO] ({i}/{total_pdf}) Converto in testo: {pdfname}")

        try:
            content_text = pdf_to_text(pdfpath)
        except Exception as e:
            print(f"[ERRORE] PyPDF2 non riesce a leggere '{pdfname}': {e}. Skippato.")
            continue  # Se un PDF è veramente corrotto

        if not content_text.strip():
            print(f"[ATTENZIONE] PDF vuoto o non estraibile: {pdfname}. Skippato.")
            continue

        # 4.1 Carica un doc 'vuoto' (binario) su RAGFlow con chunk_method='manual' (per non far scattare PDFium).
        #    In realtà potremmo caricare un file binario "fittizio" o nulla. Basterebbe creare un doc senza blob,
        #    ma l'SDK di solito vuole un blob. Facciamo un piccolo hack: un blob di 0 byte, giusto per avere un doc.
        doc_list = [{
            "display_name": pdfname,
            "blob": b"",  # niente PDF in realta'
            "chunk_method": "manual",
            "parser_config": {"raptor": {"user_raptor": False}}
        }]

        # Carica e crea il doc
        dataset.upload_documents(document_list=doc_list)
        # Recupera il doc creato appena (cercandolo per nome)
        found_docs = dataset.list_documents(keywords=pdfname, page=1, page_size=10)
        doc = None
        for d in found_docs:
            if d.name == pdfname:
                doc = d
                break

        if not doc:
            print(f"[ERRORE] Non trovo il doc appena creato '{pdfname}'. Skippato.")
            continue

        print(f"[INFO] Documento '{pdfname}' creato in dataset con ID: {doc.id}")

        # 4.2 Suddividi il testo in chunk e aggiungili
        #    (es: chunk di 2000 caratteri)
        text_len = len(content_text)
        print(f"[INFO] Lunghezza testo estratto: {text_len} caratteri")
        start_idx = 0
        chunk_count = 0
        while start_idx < text_len:
            end_idx = min(start_idx + chunk_size, text_len)
            chunk_text = content_text[start_idx:end_idx]
            chunk_count += 1

            # Aggiungi chunk
            doc.add_chunk(content=chunk_text)
            start_idx = end_idx

        print(f"[INFO] Aggiunti {chunk_count} chunk di testo a '{pdfname}'.")

    print("\n[INFO] Fine processo. Tutti i PDF validi sono stati caricati come testo (senza PDFium).")

# ==========================
# ESEMPIO D'USO
# ==========================
if __name__ == "__main__":
    API_KEY = "ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm"
    BASE_URL = "http://sgailegal.it:9380"
    DATASET_NAME = "sentenze_1739462764_8500"
    FOLDER_PATH = "/home/ubuntu/LLM_14/LLM_14/data/sentenze"

    load_pdfs_with_local_parsing(
        api_key=API_KEY,
        base_url=BASE_URL,
        dataset_name=DATASET_NAME,
        folder_path=FOLDER_PATH,
        chunk_size=30
    )
