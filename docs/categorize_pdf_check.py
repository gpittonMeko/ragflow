import os
import json
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from collections import defaultdict, Counter
import re
from typing import Dict, List, Tuple, Any, Optional
import hashlib

def get_project_root():
    """
    Ottiene il percorso della directory principale del progetto.
    Lo script si trova in docs/, quindi dobbiamo risalire di un livello.
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))  # Cartella docs/
    project_root = os.path.dirname(script_dir)  # Cartella principale
    return project_root

def analizza_metadati_sentenze(cartella_json: str = None, report_output: str = "report_analisi"):
    """
    Analizza tutti i file JSON di metadati nella cartella specificata e genera report sulla qualità e ridondanza.
    Se cartella_json è None, cerca automaticamente nella directory principale.
    """
    # Rileva automaticamente la posizione dei file JSON (percorso assoluto)
    if cartella_json is None:
        project_root = get_project_root()
        cartella_json = os.path.join(project_root, "output_json")
        print(f"Percorso automatico dei metadati: {cartella_json}")
    
    print(f"Directory di lavoro corrente: {os.getcwd()}")
    print(f"Avvio analisi metadati in: {cartella_json}")
    
    # Verifica se la cartella esiste
    if not os.path.exists(cartella_json):
        print(f"ERRORE: La cartella {cartella_json} non esiste!")
        print("Suggerimento: La cartella output_json dovrebbe trovarsi nella directory principale del progetto.")
        
        # Tenta di cercare la cartella output_json in varie posizioni
        possibili_percorsi = [
            os.path.join(os.getcwd(), "output_json"),
            os.path.join(os.path.dirname(os.getcwd()), "output_json")
        ]
        
        for percorso in possibili_percorsi:
            if os.path.exists(percorso):
                print(f"Trovata cartella output_json in: {percorso}")
                cartella_json = percorso
                break
        else:
            print("Impossibile trovare automaticamente la cartella output_json.")
            return None, None, None
    
    # Crea cartella di output se non esiste
    report_output_abs = os.path.join(get_project_root(), report_output)
    if not os.path.exists(report_output_abs):
        os.makedirs(report_output_abs)
        print(f"Creata cartella di report: {report_output_abs}")
    else:
        print(f"Cartella report esistente: {report_output_abs}")
    
    # 1. Raccolta dati
    metadati = []
    errori = []
    json_files = [f for f in os.listdir(cartella_json) if f.endswith("_metadata.json")]
    
    if not json_files:
        print(f"Nessun file di metadati trovato in: {cartella_json}")
        return None, None, None
    
    print(f"Trovati {len(json_files)} file di metadati da analizzare")
    
    for json_file in json_files:
        file_path = os.path.join(cartella_json, json_file)
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
                # Ogni file contiene un array di risultati (uno per chunk)
                # Prendiamo l'ultimo chunk come rappresentativo dell'intero documento
                if isinstance(data, list) and data:
                    doc_data = data[-1]  # Ultimo chunk
                    
                    # Verifica se c'è stato un errore di parsing JSON
                    if "errore" in doc_data and "JSONDecodeError" in doc_data["errore"]:
                        errori.append({
                            "filename": doc_data.get("filename", json_file),
                            "tipo_errore": "JSONDecodeError",
                            "dettagli": doc_data.get("errore", "")
                        })
                    else:
                        # Aggiungiamo il percorso del file JSON
                        doc_data["json_path"] = file_path
                        
                        # Estrai nome file PDF originale
                        pdf_name = json_file.replace("_metadata.json", "")
                        doc_data["pdf_name"] = pdf_name
                        
                        metadati.append(doc_data)
                else:
                    errori.append({
                        "filename": json_file,
                        "tipo_errore": "Formato non valido",
                        "dettagli": "Il file non contiene un array o è vuoto"
                    })
        
        except Exception as e:
            errori.append({
                "filename": json_file,
                "tipo_errore": "Errore di lettura",
                "dettagli": str(e)
            })
    
    print(f"Elaborati con successo: {len(metadati)} documenti")
    print(f"Errori: {len(errori)} documenti")
    
    if not metadati:
        print("Nessun metadato valido da analizzare.")
        return None, None, errori
    
    # 2. Analisi di base e creazione DataFrame
    df = pd.DataFrame(metadati)
    
    # 3. Controllo dei campi obbligatori
    campi_obbligatori = ["filename", "tipo_documento"]
    completezza = {}
    
    for campo in campi_obbligatori:
        completezza[campo] = {
            "presenti": sum(1 for doc in metadati if campo in doc and doc[campo]),
            "mancanti": sum(1 for doc in metadati if campo not in doc or not doc[campo]),
            "percentuale_completezza": 100 * sum(1 for doc in metadati if campo in doc and doc[campo]) / len(metadati)
        }
    
    # 4. Controllo di coerenza dei dati
    incoerenze = []
    
    for doc in metadati:
        # Verifica coerenza tra anno_sentenza e anno nel numero sentenza
        if doc.get("tipo_documento") == "sentenza":
            anno_sentenza = doc.get("anno_sentenza")
            anno_numero = doc.get("anno_numero_sentenza", "")
            
            if anno_sentenza and anno_numero and isinstance(anno_numero, str):
                if anno_numero.startswith(str(anno_sentenza)):
                    pass  # Coerente
                else:
                    incoerenze.append({
                        "filename": doc.get("filename", ""),
                        "tipo_incoerenza": "Incoerenza anno",
                        "dettagli": f"anno_sentenza={anno_sentenza}, anno_numero_sentenza={anno_numero}"
                    })
    
    # 5. Identificazione di potenziali duplicati
    duplicati = identificare_duplicati(metadati)
    
    # 6. Analisi della distribuzione delle materie
    distribuzione_materie = Counter()
    for doc in metadati:
        if doc.get("tipo_documento") == "sentenza" and doc.get("materia"):
            distribuzione_materie[doc["materia"]] += 1
    
    # 7. Analisi della distribuzione degli anni
    anni = [doc.get("anno_sentenza") for doc in metadati 
            if doc.get("tipo_documento") == "sentenza" and doc.get("anno_sentenza")]
    distribuzione_anni = Counter(anni)
    
    # 8. Massimario e riferimenti normativi più comuni
    massimario_counter = Counter()
    norme_counter = Counter()
    
    for doc in metadati:
        # Massimario
        if isinstance(doc.get("massimario"), list):
            for etichetta in doc["massimario"]:
                massimario_counter[etichetta] += 1
        
        # Riferimenti normativi
        if isinstance(doc.get("riferimenti_normativi"), list):
            for rif in doc["riferimenti_normativi"]:
                norme_counter[rif] += 1
    
    # 9. Generazione Report e Grafici
    genera_report_completo(
        df, 
        completezza, 
        incoerenze, 
        duplicati, 
        distribuzione_materie, 
        distribuzione_anni, 
        massimario_counter, 
        norme_counter, 
        errori,
        report_output_abs
    )
    
    print(f"Analisi completata. Report generato in: {report_output_abs}")
    return df, metadati, errori

def identificare_duplicati(metadati: List[Dict]) -> List[Dict]:
    """
    Identifica documenti che potrebbero essere duplicati basandosi su criteri diversi.
    """
    # Indici per la ricerca di duplicati
    indice_anno_numero = defaultdict(list)
    indice_contenuto = defaultdict(list)
    
    duplicati = []
    
    for i, doc in enumerate(metadati):
        if doc.get("tipo_documento") == "sentenza":
            # Raggruppa per anno_numero_sentenza
            anno_numero = doc.get("anno_numero_sentenza")
            if anno_numero:
                indice_anno_numero[anno_numero].append(i)
            
            # Crea hash del contenuto essenziale
            dati_essenziali = {
                "anno_sentenza": doc.get("anno_sentenza"),
                "numero_sentenza": doc.get("numero_sentenza"),
                "autorita_emittente": doc.get("autorita_emittente"),
                "localizzazione_corte": doc.get("localizzazione_corte")
            }
            
            # Crea un hash dei dati essenziali
            hash_contenuto = hashlib.md5(json.dumps(dati_essenziali, sort_keys=True).encode()).hexdigest()
            indice_contenuto[hash_contenuto].append(i)
    
    # Trova gruppi con più di un documento
    for anno_numero, indices in indice_anno_numero.items():
        if len(indices) > 1:
            gruppo = {"criterio": "anno_numero_sentenza", "valore": anno_numero, "documenti": []}
            for idx in indices:
                gruppo["documenti"].append({
                    "filename": metadati[idx].get("filename", ""),
                    "pdf_name": metadati[idx].get("pdf_name", ""),
                    "json_path": metadati[idx].get("json_path", "")
                })
            duplicati.append(gruppo)
    
    for hash_val, indices in indice_contenuto.items():
        if len(indices) > 1:
            # Verifica se questo gruppo è già stato identificato con altri criteri
            already_found = False
            for d in duplicati:
                if set(i["filename"] for i in d["documenti"]) == set(metadati[idx].get("filename", "") for idx in indices):
                    already_found = True
                    break
            
            if not already_found:
                gruppo = {"criterio": "contenuto_essenziale", "valore": hash_val[:8], "documenti": []}
                for idx in indices:
                    gruppo["documenti"].append({
                        "filename": metadati[idx].get("filename", ""),
                        "pdf_name": metadati[idx].get("pdf_name", ""),
                        "json_path": metadati[idx].get("json_path", "")
                    })
                duplicati.append(gruppo)
    
    return duplicati

def genera_report_completo(
    df: pd.DataFrame, 
    completezza: Dict, 
    incoerenze: List[Dict], 
    duplicati: List[Dict], 
    distribuzione_materie: Counter, 
    distribuzione_anni: Counter, 
    massimario_counter: Counter, 
    norme_counter: Counter, 
    errori: List[Dict],
    output_dir: str
):
    """
    Genera un report completo dell'analisi, inclusi grafici e file CSV.
    """
    try:
        # 1. Salva tutti i dati in formato CSV
        df.to_csv(os.path.join(output_dir, "metadati_completi.csv"), index=False)
        
        # 2. Report sulla completezza
        completezza_df = pd.DataFrame([{
            "campo": campo,
            "presenti": info["presenti"],
            "mancanti": info["mancanti"],
            "percentuale_completezza": info["percentuale_completezza"]
        } for campo, info in completezza.items()])
        
        completezza_df.to_csv(os.path.join(output_dir, "completezza_campi.csv"), index=False)
        
        # Grafico completezza
        plt.figure(figsize=(10, 6))
        sns.barplot(x="campo", y="percentuale_completezza", data=completezza_df)
        plt.title("Completezza dei campi obbligatori")
        plt.xlabel("Campo")
        plt.ylabel("Percentuale di completezza")
        plt.xticks(rotation=45)
        plt.tight_layout()
        plt.savefig(os.path.join(output_dir, "completezza_campi.png"))
        plt.close()
        
        # 3. Report sulle incoerenze
        if incoerenze:
            pd.DataFrame(incoerenze).to_csv(os.path.join(output_dir, "incoerenze.csv"), index=False)
        
        # 4. Report sui duplicati
        if duplicati:
            with open(os.path.join(output_dir, "duplicati.json"), "w", encoding="utf-8") as f:
                json.dump(duplicati, f, indent=2, ensure_ascii=False)
        
        # 5. Grafici distribuzione materie (top 15)
        if distribuzione_materie:
            top_materie = dict(distribuzione_materie.most_common(15))
            plt.figure(figsize=(12, 8))
            sns.barplot(x=list(top_materie.keys()), y=list(top_materie.values()))
            plt.title("Top 15 materie")
            plt.xlabel("Materia")
            plt.ylabel("Conteggio")
            plt.xticks(rotation=90)
            plt.tight_layout()
            plt.savefig(os.path.join(output_dir, "top_materie.png"))
            plt.close()
            
            # Salva tutte le materie in un CSV
            materie_df = pd.DataFrame([{"materia": materia, "conteggio": count} 
                                     for materia, count in distribuzione_materie.items()])
            materie_df.to_csv(os.path.join(output_dir, "distribuzione_materie.csv"), index=False)
        
        # 6. Grafico distribuzione anni
        if distribuzione_anni:
            anni_sorted = sorted(distribuzione_anni.items())
            plt.figure(figsize=(12, 6))
            sns.barplot(x=[str(anno) for anno, _ in anni_sorted], y=[count for _, count in anni_sorted])
            plt.title("Distribuzione degli anni delle sentenze")
            plt.xlabel("Anno")
            plt.ylabel("Conteggio")
            plt.xticks(rotation=45)
            plt.tight_layout()
            plt.savefig(os.path.join(output_dir, "distribuzione_anni.png"))
            plt.close()
            
            # Salva distribuzione anni in CSV
            anni_df = pd.DataFrame([{"anno": anno, "conteggio": count} 
                                   for anno, count in anni_sorted])
            anni_df.to_csv(os.path.join(output_dir, "distribuzione_anni.csv"), index=False)
        
        # 7. Report su massimario e riferimenti normativi (top 20)
        if massimario_counter:
            top_massimario = dict(massimario_counter.most_common(20))
            massimario_df = pd.DataFrame([{"etichetta": etichetta, "conteggio": count} 
                                        for etichetta, count in massimario_counter.items()])
            massimario_df.to_csv(os.path.join(output_dir, "massimario.csv"), index=False)
        
        if norme_counter:
            top_norme = dict(norme_counter.most_common(20))
            norme_df = pd.DataFrame([{"riferimento": rif, "conteggio": count} 
                                   for rif, count in norme_counter.items()])
            norme_df.to_csv(os.path.join(output_dir, "riferimenti_normativi.csv"), index=False)
        
        # 8. Report errori
        if errori:
            pd.DataFrame(errori).to_csv(os.path.join(output_dir, "errori.csv"), index=False)
        
        # 9. Report riassuntivo in formato testo
        with open(os.path.join(output_dir, "report_riassuntivo.txt"), "w", encoding="utf-8") as f:
            f.write("ANALISI METADATI SENTENZE\n")
            f.write("========================\n\n")
            
            f.write(f"Totale documenti analizzati: {len(df)}\n")
            f.write(f"Documenti con errori: {len(errori)}\n\n")
            
            if "tipo_documento" in df.columns:
                tipo_doc_counts = df["tipo_documento"].value_counts()
                f.write("Distribuzione per tipo di documento:\n")
                for tipo, count in tipo_doc_counts.items():
                    f.write(f"- {tipo}: {count} ({count/len(df)*100:.1f}%)\n")
                f.write("\n")
            
            f.write("Completezza dei campi obbligatori:\n")
            for campo, info in completezza.items():
                f.write(f"- {campo}: {info['percentuale_completezza']:.1f}% completo\n")
            f.write("\n")
            
            f.write(f"Totale incoerenze rilevate: {len(incoerenze)}\n")
            f.write(f"Totale potenziali duplicati: {len(duplicati)} gruppi\n\n")
            
            if distribuzione_materie:
                f.write("Top 5 materie:\n")
                for materia, count in distribuzione_materie.most_common(5):
                    f.write(f"- {materia}: {count}\n")
                f.write("\n")
            
            if massimario_counter:
                f.write("Top 5 etichette massimario:\n")
                for etichetta, count in massimario_counter.most_common(5):
                    f.write(f"- {etichetta}: {count}\n")
                f.write("\n")
            
            if norme_counter:
                f.write("Top 5 riferimenti normativi:\n")
                for rif, count in norme_counter.most_common(5):
                    f.write(f"- {rif}: {count}\n")
                    
    except Exception as e:
        print(f"Errore durante la generazione dei report: {e}")
        import traceback
        traceback.print_exc()

def main():
    print("ANALIZZATORE DI METADATI DI SENTENZE")
    print("====================================")
    print("Questo script cercherà automaticamente i file nella directory principale del progetto.")
    
    # Avvia l'analisi con rilevamento automatico del percorso
    print("\nAvvio analisi con rilevamento automatico del percorso...")
    df, metadati, errori = analizza_metadati_sentenze()
    
    if df is not None:
        print("\nAnalisi completata con successo!")
        print(f"I report sono stati salvati nella cartella: report_analisi")
        print("\nStatistiche rapide:")
        print(f"- Documenti analizzati: {len(df)}")
        if "tipo_documento" in df.columns:
            tipo_counts = df["tipo_documento"].value_counts()
            for tipo, count in tipo_counts.items():
                print(f"- {tipo.capitalize()}: {count}")
    else:
        print("\nAnalisi terminata senza risultati. Controlla i messaggi di errore.")

if __name__ == "__main__":
    main()