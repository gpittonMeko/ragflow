import os
import requests

# --- Configuration ---
PDF_DIRECTORY = "/home/ubuntu/LLM_14/LLM_14/data/sentenze"
RAGFLOW_API_BASE_URL = "https://sgailegal.it"  # Replace with your RAGFlow API base URL
RAGFLOW_API_KEY = "ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm"  # Replace with your RAGFlow API key
DATASET_NAME = "sentenze_dataset"  # Name for the RAGFlow dataset

# --- Helper Functions ---

def list_pdf_files(directory):
    """Lists all PDF files in the given directory."""
    pdf_files = [f for f in os.listdir(directory) if f.endswith(".pdf")]
    return [os.path.join(directory, f) for f in pdf_files]

def create_ragflow_dataset(api_base_url, api_key, dataset_name):
    """Creates a new dataset in RAGFlow if it doesn't exist."""
    url = f"{api_base_url}/api/v1/datasets"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    data = {
        "name": dataset_name
    }
    try:
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        response_json = response.json()
        if response_json.get("code") == 0:
            dataset_id = response_json["data"]["id"]
            print(f"Dataset '{dataset_name}' created with ID: {dataset_id}")
            return dataset_id
        elif response_json.get("code") == 102 and "Duplicated knowledgebase name" in response_json.get("message", ""):
            # Dataset already exists, need to retrieve its ID
            print(f"Dataset '{dataset_name}' already exists. Attempting to retrieve its ID...")
            datasets = list_ragflow_datasets(api_base_url, api_key, name=dataset_name)
            if datasets:
                return datasets[0]["id"]
            else:
                print(f"Error: Could not retrieve ID for existing dataset '{dataset_name}'.")
                return None
        else:
            print(f"Error creating dataset '{dataset_name}': {response_json}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"Error connecting to RAGFlow API: {e}")
        return None

def list_ragflow_datasets(api_base_url, api_key, name=None):
    """Lists datasets in RAGFlow, optionally filtering by name."""
    url = f"{api_base_url}/api/v1/datasets"
    headers = {
        "Authorization": f"Bearer {api_key}"
    }
    params = {}
    if name:
        params["name"] = name
    try:
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        response_json = response.json()
        if response_json.get("code") == 0:
            return response_json["data"]
        else:
            print(f"Error listing datasets: {response_json}")
            return []
    except requests.exceptions.RequestException as e:
        print(f"Error connecting to RAGFlow API: {e}")
        return []

def list_documents_in_ragflow(api_base_url, api_key, dataset_id):
    """Lists all documents in the specified RAGFlow dataset."""
    url = f"{api_base_url}/api/v1/datasets/{dataset_id}/documents"
    headers = {
        "Authorization": f"Bearer {api_key}"
    }
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        response_json = response.json()
        if response_json.get("code") == 0:
            return response_json["data"].get("docs", [])
        else:
            print(f"Error listing documents in dataset '{dataset_id}': {response_json}")
            return []
    except requests.exceptions.RequestException as e:
        print(f"Error connecting to RAGFlow API: {e}")
        return []

def upload_pdf_to_ragflow(api_base_url, api_key, dataset_id, pdf_filepath):
    """Uploads a single PDF file to the specified RAGFlow dataset."""
    url = f"{api_base_url}/api/v1/datasets/{dataset_id}/documents"
    headers = {
        "Authorization": f"Bearer {api_key}"
    }
    files = {
        "file": open(pdf_filepath, "rb")
    }
    try:
        response = requests.post(url, headers=headers, files=files)
        response.raise_for_status()
        response_json = response.json()
        if response_json.get("code") == 0:
            document_id = response_json["data"][0]["id"]
            document_name = response_json["data"][0]["name"]
            print(f"Successfully uploaded '{document_name}' (ID: {document_id}) to dataset '{dataset_id}'.")
            return document_id
        else:
            print(f"Error uploading '{pdf_filepath}' to dataset '{dataset_id}': {response_json}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"Error connecting to RAGFlow API: {e}")
        return None
    finally:
        if "file" in files:
            files["file"].close()

def parse_document_in_ragflow(api_base_url, api_key, dataset_id, document_id):
    """Triggers the parsing of a specific document in RAGFlow."""
    url = f"{api_base_url}/api/v1/datasets/{dataset_id}/chunks"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    data = {
        "document_ids": [document_id]
    }
    try:
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        response_json = response.json()
        if response_json.get("code") == 0:
            print(f"Successfully triggered parsing for document ID '{document_id}' in dataset '{dataset_id}'.")
            return True
        else:
            print(f"Error triggering parsing for document ID '{document_id}' in dataset '{dataset_id}': {response_json}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"Error connecting to RAGFlow API: {e}")
        return False

# --- Main Script ---

if __name__ == "__main__":
    # 1. List all PDF files in the specified directory.
    pdf_files_to_upload = list_pdf_files(PDF_DIRECTORY)
    if not pdf_files_to_upload:
        print(f"No PDF files found in the directory: {PDF_DIRECTORY}")
    else:
        print(f"Found {len(pdf_files_to_upload)} PDF files to process.")

        # 2. Initialize RAGFlow API connection details.
        api_base_url = RAGFLOW_API_BASE_URL.format(address="your_ragflow_instance_address")
        api_key = RAGFLOW_API_KEY

        # 3. Create the dataset in RAGFlow if it doesn't exist.
        dataset_id = create_ragflow_dataset(api_base_url, api_key, DATASET_NAME)

        if dataset_id:
            print(f"\n--- Checking for already uploaded files in dataset '{DATASET_NAME}' (ID: {dataset_id}) ---")
            existing_documents = list_documents_in_ragflow(api_base_url, api_key, dataset_id)
            existing_document_names = {doc["name"] for doc in existing_documents}

            files_to_upload = [
                filepath for filepath in pdf_files_to_upload
                if os.path.basename(filepath) not in existing_document_names
            ]

            if not files_to_upload:
                print("All PDF files in the directory have already been uploaded.")
            else:
                print(f"\n--- Uploading {len(files_to_upload)} new PDF files to dataset '{DATASET_NAME}' (ID: {dataset_id}) ---")
                uploaded_document_ids = []
                for pdf_filepath in files_to_upload:
                    filename = os.path.basename(pdf_filepath)
                    print(f"Processing: {filename}")
                    # 4. Upload each new PDF file to the dataset.
                    document_id = upload_pdf_to_ragflow(api_base_url, api_key, dataset_id, pdf_filepath)
                    if document_id:
                        uploaded_document_ids.append(document_id)

                if uploaded_document_ids:
                    print("\n--- Triggering parsing for newly uploaded documents ---")
                    # 5. Trigger the parsing of all newly uploaded documents.
                    for doc_id in uploaded_document_ids:
                        parse_document_in_ragflow(api_base_url, api_key, dataset_id, doc_id)
                    print("Parsing of newly uploaded documents triggered.")
                else:
                    print("No new documents were uploaded.")

            print("\nOperation completed.")
        else:
            print("Failed to create or retrieve the dataset. Cannot proceed with file upload.")