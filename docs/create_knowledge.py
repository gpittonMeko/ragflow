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

    # 1. Inizializza il client RAGFlow
    rag_object = RAGFlow(api_key=api_key, base_url=base_url)

    # 2. Crea (o recupera) il dataset desiderato
    #    Se esiste già un dataset con lo stesso nome, possiamo recuperarlo dall’elenco.
    #    In caso contrario, verrà creato uno nuovo.
    existing_datasets = rag_object.list_datasets(name=dataset_name)
    if existing_datasets:
        dataset = existing_datasets[0]
        print(f"Dataset '{dataset_name}' trovato, utilizzo dataset esistente.")
    else:
        dataset = rag_object.create_dataset(name=dataset_name)
        print(f"Dataset '{dataset_name}' creato con successo.")

    # 3. Prepara la lista dei documenti da caricare
    documents_to_upload = []
    for filename in os.listdir(folder_path):
        if filename.lower().endswith('.pdf'):
            file_path = os.path.join(folder_path, filename)
            try:
                with open(file_path, "rb") as f:
                    blob_content = f.read()
                # Aggiungi il documento alla lista con display_name e contenuto
                documents_to_upload.append({
                    "display_name": filename,
                    "blob": blob_content
                })
            except Exception as e:
                print(f"Errore nella lettura di '{file_path}': {e}")

    if not documents_to_upload:
        print("Nessun PDF trovato nella cartella specificata.")
        return
    
    # 4. Carica i documenti nel dataset
    try:
        dataset.upload_documents(document_list=documents_to_upload)
        print(f"Caricati {len(documents_to_upload)} documenti PDF nel dataset '{dataset_name}'.")
    except Exception as e:
        print(f"Errore durante l'upload dei PDF: {e}")
        return

    # 5. Recupera la lista dei documenti caricati per avviare il parsing
    try:
        all_docs = dataset.list_documents(
            keywords=None,
            page=1,
            page_size=1000  # per sicurezza, se si caricano molti file
        )
        # Se vuoi filtrare solo i documenti appena caricati, potresti farlo
        # confrontando i nomi, ma generalmente basta prendere tutti quelli presenti.
    except Exception as e:
        print(f"Errore durante la lettura dei documenti nel dataset: {e}")
        return

    # Crea una lista di ID dei documenti
    doc_ids = [doc.id for doc in all_docs]
    if not doc_ids:
        print("Non sono stati trovati documenti da parsificare.")
        return

    # 6. Avvia l'operazione di parsing asincrono su tutti i documenti
    try:
        dataset.async_parse_documents(doc_ids)
        print(f"Parsing asincrono avviato per {len(doc_ids)} documenti.")
    except Exception as e:
        print(f"Errore durante l'avvio del parsing dei documenti: {e}")

# ============================
# ESEMPIO DI UTILIZZO
# ============================
if __name__ == "__main__":
    # Sostituisci <YOUR_API_KEY> e <YOUR_BASE_URL> con i tuoi parametri reali
    API_KEY = "ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm"
    BASE_URL = "https://sgailegal.it:9380"

    # Nome della knowledge base (dataset)
    DATASET_NAME = "sentenze_1739462764_8500"

    # Cartella locale in cui risiedono i file PDF
    FOLDER_PATH = "/home/ubuntu/LLM_14/LLM_14/data/sentenze"

    # Richiama la funzione per caricare i PDF e avviare il parsing
    load_pdfs_to_dataset(API_KEY, BASE_URL, DATASET_NAME, FOLDER_PATH)
