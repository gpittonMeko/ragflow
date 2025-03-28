import os
import shutil

cartella_output = "output_json"
file_progresso = "progresso.json"

# Elimina i file metadata
if os.path.exists(cartella_output) and os.path.isdir(cartella_output):
    file_da_eliminare_metadata = [f for f in os.listdir(cartella_output) if f.endswith("_metadata.json")]

    if file_da_eliminare_metadata:
        print(f"Trovati {len(file_da_eliminare_metadata)} file metadata da eliminare nella cartella '{cartella_output}':")
        for nome_file in file_da_eliminare_metadata:
            percorso_file = os.path.join(cartella_output, nome_file)
            try:
                os.remove(percorso_file)
                print(f"Eliminato: {nome_file}")
            except Exception as e:
                print(f"Errore durante l'eliminazione di '{nome_file}': {e}")
    else:
        print(f"Nessun file metadata (*_metadata.json) trovato nella cartella '{cartella_output}'.")
else:
    print(f"La cartella '{cartella_output}' non esiste o non è una directory.")

print("-" * 30)  # Separatore

# Elimina il file di progresso
if os.path.exists(file_progresso):
    try:
        os.remove(file_progresso)
        print(f"Eliminato il file di progresso: {file_progresso}")
    except Exception as e:
        print(f"Errore durante l'eliminazione di '{file_progresso}': {e}")
else:
    print(f"Il file di progresso '{file_progresso}' non è stato trovato.")

print("Pulizia completata.")