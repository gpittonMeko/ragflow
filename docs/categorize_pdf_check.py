import os
import json
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from collections import defaultdict, Counter
import re
from typing import Dict, List, Tuple, Any, Optional
import hashlib
import traceback
from datetime import datetime

def get_project_root():
    """
    Ottiene il percorso della directory principale del progetto.
    Lo script si trova in docs/, quindi dobbiamo risalire di un livello.
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))  # Cartella docs/
    project_root = os.path.dirname(script_dir)  # Cartella principale
    return project_root

def analizza_file_problematici(cartella_json, num_esempi=5):
    """Analizza i primi N file problematici per capire il tipo di errore."""
    json_files = [f for f in os.listdir(cartella_json) if f.endswith("_metadata.json")]
    problemi_trovati = 0
    
    print(f"\n=== ANALISI DI {num_esempi} FILE PROBLEMATICI ===")
    esempi_problematici = []
    
    for json_file in json_files:
        if problemi_trovati >= num_esempi:
            break
            
        file_path = os.path.join(cartella_json, json_file)
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                raw_content = f.read()
                try:
                    data = json.loads(raw_content)
                    # Controlliamo se il file è un array vuoto o altri problemi comuni
                    if not data:
                        problemi_trovati += 1
                        problema = {
                            "file": json_file,
                            "tipo": "Array vuoto",
                            "descrizione": "Il file contiene un array vuoto []",
                            "contenuto": raw_content[:200] + ("..." if len(raw_content) > 200 else "")
                        }
                        esempi_problematici.append(problema)
                    elif not isinstance(data, list):
                        problemi_trovati += 1
                        problema = {
                            "file": json_file,
                            "tipo": "Non è un array",
                            "descrizione": f"Il file contiene {type(data)} invece di un array",
                            "contenuto": raw_content[:200] + ("..." if len(raw_content) > 200 else "")
                        }
                        esempi_problematici.append(problema)
                except json.JSONDecodeError as e:
                    problemi_trovati += 1
                    problema = {
                        "file": json_file,
                        "tipo": "JSONDecodeError",
                        "descrizione": str(e),
                        "contenuto": raw_content[:200] + ("..." if len(raw_content) > 200 else "")
                    }
                    esempi_problematici.append(problema)
        except Exception as e:
            problemi_trovati += 1
            problema = {
                "file": json_file,
                "tipo": "Errore di lettura",
                "descrizione": str(e),
                "contenuto": "N/A"
            }
            esempi_problematici.append(problema)
    
    # Stampa i problemi trovati
    for i, problema in enumerate(esempi_problematici):
        print(f"\nProblema {i+1}:")
        print(f"File: {problema['file']}")
        print(f"Tipo: {problema['tipo']}")
        print(f"Descrizione: {problema['descrizione']}")
        print(f"Contenuto parziale:")
        print(problema['contenuto'])
    
    return esempi_problematici

def analizza_metadati_sentenze(cartella_json: str = None, report_output: str = "report_analisi", analisi_errori=True):
    """
    Analizza tutti i file JSON di metadati nella cartella specificata e genera report sulla qualità e ridondanza.
    Se cartella_json è None, cerca automaticamente nella directory principale.
    """
    # Timestamp per il report
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
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
            os.path.join(os.path.dirname(os.getcwd()), "output_json"),
            os.path.join(os.getcwd(), "docs", "output_json")
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
    
    # Statistiche di elaborazione
    json_files = [f for f in os.listdir(cartella_json) if f.endswith("_metadata.json")]
    total_files = len(json_files)
    
    if not json_files:
        print(f"Nessun file di metadati trovato in: {cartella_json}")
        return None, None, None
    
    print(f"Trovati {total_files} file di metadati da analizzare")
    
    # Contatori per statistiche dettagliate
    contatori_errori = Counter()
    formati_json = Counter()
    
    # Raccogliamo statistiche sulle dimensioni dei file
    dimensioni_file = []
    
    for json_file in json_files:
        file_path = os.path.join(cartella_json, json_file)
        file_size = os.path.getsize(file_path) / 1024  # Dimensione in KB
        dimensioni_file.append(file_size)
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                raw_content = f.read()
                try:
                    data = json.loads(raw_content)
                    
                    # Verifica formato e struttura
                    if isinstance(data, list):
                        formati_json["array"] += 1
                        if not data:
                            formati_json["array_vuoto"] += 1
                            errori.append({
                                "filename": json_file,
                                "tipo_errore": "Array vuoto",
                                "dettagli": "Il file contiene un array vuoto"
                            })
                            contatori_errori["Array vuoto"] += 1
                            continue
                    else:
                        formati_json["non_array"] += 1
                        errori.append({
                            "filename": json_file,
                            "tipo_errore": "Formato non valido",
                            "dettagli": f"Il file contiene {type(data)} invece di un array"
                        })
                        contatori_errori["Formato non array"] += 1
                        continue
                    
                    # Ogni file contiene un array di risultati (uno per chunk)
                    # Prendiamo l'ultimo chunk come rappresentativo dell'intero documento
                    doc_data = data[-1]  # Ultimo chunk
                    
                    # Verifica se c'è stato un errore di parsing JSON nel contenuto
                    if "errore" in doc_data and "JSONDecodeError" in doc_data.get("errore", ""):
                        errori.append({
                            "filename": doc_data.get("filename", json_file),
                            "tipo_errore": "JSONDecodeError nel contenuto",
                            "dettagli": doc_data.get("errore", "")
                        })
                        contatori_errori["JSONDecodeError nel contenuto"] += 1
                    else:
                        # Aggiungiamo il percorso del file JSON
                        doc_data["json_path"] = file_path
                        
                        # Estrai nome file PDF originale
                        pdf_name = json_file.replace("_metadata.json", "")
                        doc_data["pdf_name"] = pdf_name
                        
                        metadati.append(doc_data)
                except json.JSONDecodeError as e:
                    errori.append({
                        "filename": json_file,
                        "tipo_errore": "JSONDecodeError",
                        "dettagli": str(e)
                    })
                    contatori_errori["JSONDecodeError"] += 1
        
        except Exception as e:
            errori.append({
                "filename": json_file,
                "tipo_errore": "Errore di lettura",
                "dettagli": str(e)
            })
            contatori_errori["Errore di lettura"] += 1
    
    print(f"Elaborati con successo: {len(metadati)} documenti")
    print(f"Errori: {len(errori)} documenti")
    
    # Se richiesto, analizza alcuni file problematici per esempio
    if analisi_errori and errori:
        problemi_esempi = analizza_file_problematici(cartella_json, 5)
    
    if not metadati:
        print("Nessun metadato valido da analizzare.")
        
        # Anche se non ci sono metadati, generiamo un report sugli errori
        errori_df = pd.DataFrame(errori)
        errori_df.to_csv(os.path.join(report_output_abs, "errori.csv"), index=False)
        
        # Crea report sugli errori
        with open(os.path.join(report_output_abs, "report_errori.txt"), "w", encoding="utf-8") as f:
            f.write("REPORT ERRORI NELL'ANALISI METADATI\n")
            f.write("==================================\n\n")
            f.write(f"Data analisi: {timestamp}\n\n")
            f.write(f"Totale file analizzati: {total_files}\n")
            f.write(f"File con errori: {len(errori)} ({len(errori)/total_files*100:.1f}%)\n\n")
            
            f.write("Distribuzione dei tipi di errore:\n")
            for tipo, count in contatori_errori.most_common():
                f.write(f"- {tipo}: {count} ({count/len(errori)*100:.1f}%)\n")
            
            f.write("\nDistribuzione dei formati JSON:\n")
            for formato, count in formati_json.items():
                f.write(f"- {formato}: {count} ({count/total_files*100:.1f}%)\n")
            
            f.write("\nStatistiche sulle dimensioni dei file (KB):\n")
            f.write(f"- Minima: {min(dimensioni_file):.2f} KB\n")
            f.write(f"- Media: {sum(dimensioni_file)/len(dimensioni_file):.2f} KB\n")
            f.write(f"- Massima: {max(dimensioni_file):.2f} KB\n")
        
        # Grafici sugli errori
        plt.figure(figsize=(12, 6))
        errori_comuni = dict(contatori_errori.most_common(10))
        sns.barplot(x=list(errori_comuni.keys()), y=list(errori_comuni.values()))
        plt.title("Top 10 tipi di errore")
        plt.xlabel("Tipo di errore")
        plt.ylabel("Conteggio")
        plt.xticks(rotation=45)
        plt.tight_layout()
        plt.savefig(os.path.join(report_output_abs, "tipi_errore.png"))
        plt.close()
        
        # Grafico dimensioni file
        plt.figure(figsize=(10, 6))
        sns.histplot(dimensioni_file, bins=20)
        plt.title("Distribuzione delle dimensioni dei file JSON")
        plt.xlabel("Dimensione (KB)")
        plt.ylabel("Conteggio")
        plt.tight_layout()
        plt.savefig(os.path.join(report_output_abs, "dimensioni_file.png"))
        plt.close()
        
        return None, None, errori
    
    # 2. Analisi di base e creazione DataFrame
    df = pd.DataFrame(metadati)
    
    # Analisi dei campi presenti/assenti
    tutti_i_campi = set()
    for doc in metadati:
        tutti_i_campi.update(doc.keys())
    
    # Escludiamo alcuni campi tecnici dal conteggio
    campi_tecnici = {"json_path", "pdf_name", "raw_output"}
    campi_metadati = [c for c in tutti_i_campi if c not in campi_tecnici]
    
    # Statistiche presenza campi
    presenza_campi = {}
    for campo in campi_metadati:
        presenza_campi[campo] = {
            "presenti": sum(1 for doc in metadati if campo in doc and doc[campo] is not None),
            "vuoti": sum(1 for doc in metadati if campo in doc and doc[campo] is None),
            "mancanti": sum(1 for doc in metadati if campo not in doc),
            "percentuale_completezza": 100 * sum(1 for doc in metadati if campo in doc and doc[campo] is not None) / len(metadati)
        }
    
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
                if str(anno_sentenza) in str(anno_numero):
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
    
    # 9. Analisi delle autorità emittenti
    autorita_counter = Counter()
    for doc in metadati:
        if doc.get("tipo_documento") == "sentenza" and doc.get("autorita_emittente"):
            autorita_counter[doc["autorita_emittente"]] += 1
    
    # 10. Analisi degli esiti di giudizio
    esiti_counter = Counter()
    for doc in metadati:
        if doc.get("tipo_documento") == "sentenza" and doc.get("esito_giudizio"):
            esiti_counter[doc["esito_giudizio"]] += 1
    
    # 11. Statistiche sulla lunghezza dei campi testuali
    lunghezza_campi = {}
    campi_testuali = ["localizzazione_corte", "composizione_corte", "esito_controversia"]
    
    for campo in campi_testuali:
        lunghezze = [len(str(doc.get(campo, ""))) for doc in metadati if campo in doc and doc.get(campo)]
        if lunghezze:
            lunghezza_campi[campo] = {
                "min": min(lunghezze),
                "max": max(lunghezze),
                "media": sum(lunghezze) / len(lunghezze),
                "n_valori": len(lunghezze)
            }
    
    # 12. Generazione Report e Grafici
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
        presenza_campi,
        formati_json,
        dimensioni_file,
        autorita_counter,
        esiti_counter,
        lunghezza_campi,
        contatori_errori,
        timestamp,
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
            try:
                for d in duplicati:
                    if d["documenti"] and indices and set(i["filename"] for i in d["documenti"] if "filename" in i) == set(metadati[idx].get("filename", "") for idx in indices if idx < len(metadati)):
                        already_found = True
                        break
            except:
                # In caso di errore, passiamo alla prossima iterazione
                continue
            
            if not already_found:
                gruppo = {"criterio": "contenuto_essenziale", "valore": hash_val[:8], "documenti": []}
                for idx in indices:
                    if idx < len(metadati):  # Protezione contro indici fuori gamma
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
    presenza_campi: Dict,
    formati_json: Counter,
    dimensioni_file: List[float],
    autorita_counter: Counter,
    esiti_counter: Counter,
    lunghezza_campi: Dict,
    contatori_errori: Counter,
    timestamp: str,
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
        
        # 3. Report sulla presenza di tutti i campi
        presenza_df = pd.DataFrame([{
            "campo": campo,
            "presenti": info["presenti"],
            "vuoti": info["vuoti"],
            "mancanti": info["mancanti"],
            "percentuale_completezza": info["percentuale_completezza"]
        } for campo, info in presenza_campi.items()])
        
        presenza_df.to_csv(os.path.join(output_dir, "presenza_campi.csv"), index=False)
        
        # Grafico presenza campi (primi 20)
        top_campi = presenza_df.sort_values("percentuale_completezza", ascending=False).head(20)
        plt.figure(figsize=(12, 8))
        sns.barplot(x="campo", y="percentuale_completezza", data=top_campi)
        plt.title("Completezza dei campi principali")
        plt.xlabel("Campo")
        plt.ylabel("Percentuale di completezza")
        plt.xticks(rotation=45)
        plt.tight_layout()
        plt.savefig(os.path.join(output_dir, "completezza_campi_top20.png"))
        plt.close()
        
        # 4. Report sulle incoerenze
        if incoerenze:
            pd.DataFrame(incoerenze).to_csv(os.path.join(output_dir, "incoerenze.csv"), index=False)
        
        # 5. Report sui duplicati
        if duplicati:
            with open(os.path.join(output_dir, "duplicati.json"), "w", encoding="utf-8") as f:
                json.dump(duplicati, f, indent=2, ensure_ascii=False)
        
        # 6. Grafici distribuzione materie (top 15)
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
        
        # 7. Grafico distribuzione anni
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
        
        # 8. Grafico autorità emittenti (top 10)
        if autorita_counter:
            top_autorita = dict(autorita_counter.most_common(10))
            plt.figure(figsize=(12, 6))
            sns.barplot(x=list(top_autorita.keys()), y=list(top_autorita.values()))
            plt.title("Top 10 autorità emittenti")
            plt.xlabel("Autorità")
            plt.ylabel("Conteggio")
            plt.xticks(rotation=45)
            plt.tight_layout()
            plt.savefig(os.path.join(output_dir, "top_autorita.png"))
            plt.close()
            
            # Salva tutte le autorità in un CSV
            autorita_df = pd.DataFrame([{"autorita": aut, "conteggio": count} 
                                      for aut, count in autorita_counter.items()])
            autorita_df.to_csv(os.path.join(output_dir, "distribuzione_autorita.csv"), index=False)
        
        # 9. Grafico esiti di giudizio
        if esiti_counter:
            esiti_df = pd.DataFrame([{"esito": esito, "conteggio": count} 
                                   for esito, count in esiti_counter.items()])
            esiti_df.to_csv(os.path.join(output_dir, "distribuzione_esiti.csv"), index=False)
            
            plt.figure(figsize=(12, 6))
            sns.barplot(x="esito", y="conteggio", data=esiti_df)
            plt.title("Distribuzione degli esiti di giudizio")
            plt.xlabel("Esito")
            plt.ylabel("Conteggio")
            plt.xticks(rotation=45)
            plt.tight_layout()
            plt.savefig(os.path.join(output_dir, "distribuzione_esiti.png"))
            plt.close()
        
        # 10. Report su massimario e riferimenti normativi (top 20)
        if massimario_counter:
            top_massimario = dict(massimario_counter.most_common(20))
            massimario_df = pd.DataFrame([{"etichetta": etichetta, "conteggio": count} 
                                        for etichetta, count in massimario_counter.items()])
            massimario_df.to_csv(os.path.join(output_dir, "massimario.csv"), index=False)
            
            plt.figure(figsize=(12, 8))
            sns.barplot(x=list(top_massimario.keys()), y=list(top_massimario.values()))
            plt.title("Top 20 etichette massimario")
            plt.xlabel("Etichetta")
            plt.ylabel("Conteggio")
            plt.xticks(rotation=90)
            plt.tight_layout()
            plt.savefig(os.path.join(output_dir, "top_massimario.png"))
            plt.close()
        
        if norme_counter:
            top_norme = dict(norme_counter.most_common(20))
            norme_df = pd.DataFrame([{"riferimento": rif, "conteggio": count} 
                                   for rif, count in norme_counter.items()])
            norme_df.to_csv(os.path.join(output_dir, "riferimenti_normativi.csv"), index=False)
            
            plt.figure(figsize=(12, 8))
            sns.barplot(x=list(top_norme.keys()), y=list(top_norme.values()))
            plt.title("Top 20 riferimenti normativi")
            plt.xlabel("Riferimento normativo")
            plt.ylabel("Conteggio")
            plt.xticks(rotation=90)
            plt.tight_layout()
            plt.savefig(os.path.join(output_dir, "top_norme.png"))
            plt.close()
        
        # 11. Report sulla lunghezza dei campi testuali
        if lunghezza_campi:
            with open(os.path.join(output_dir, "lunghezza_campi_testuali.csv"), "w", encoding="utf-8") as f:
                f.write("campo,min,max,media,n_valori\n")
                for campo, stats in lunghezza_campi.items():
                    f.write(f"{campo},{stats['min']},{stats['max']},{stats['media']:.1f},{stats['n_valori']}\n")
        
        # 12. Report errori
        if errori:
            pd.DataFrame(errori).to_csv(os.path.join(output_dir, "errori.csv"), index=False)
        
        # 13. Report riassuntivo in formato testo
        with open(os.path.join(output_dir, "report_riassuntivo.txt"), "w", encoding="utf-8") as f:
            f.write("ANALISI METADATI SENTENZE\n")
            f.write("========================\n\n")
            f.write(f"Data analisi: {timestamp}\n\n")
            
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
            
            if distribuzione_anni:
                anni_recenti = dict(sorted(distribuzione_anni.items(), reverse=True)[:5])
                f.write("Distribuzione degli ultimi 5 anni:\n")
                for anno, count in anni_recenti.items():
                    f.write(f"- {anno}: {count}\n")
                f.write("\n")
            
            if autorita_counter:
                f.write("Top 5 autorità emittenti:\n")
                for autorita, count in autorita_counter.most_common(5):
                    f.write(f"- {autorita}: {count}\n")
                f.write("\n")
            
            if esiti_counter:
                f.write("Top 5 esiti di giudizio:\n")
                for esito, count in esiti_counter.most_common(5):
                    f.write(f"- {esito}: {count}\n")
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
                f.write("\n")
            
            if lunghezza_campi:
                f.write("Statistiche lunghezza campi testuali:\n")
                for campo, stats in lunghezza_campi.items():
                    f.write(f"- {campo}: min={stats['min']}, max={stats['max']}, media={stats['media']:.1f} caratteri\n")
                f.write("\n")
                
    except Exception as e:
        print(f"Errore durante la generazione dei report: {e}")
        traceback.print_exc()

def main():
    """
    Funzione principale che esegue l'analisi completa dei metadati delle sentenze.
    """
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
        
        # Statistiche sugli errori
        if errori:
            print(f"- Documenti con errori: {len(errori)}")
            print("\nTipi di errore riscontrati:")
            errori_per_tipo = {}
            for err in errori:
                tipo = err.get("tipo_errore", "Sconosciuto")
                if tipo not in errori_per_tipo:
                    errori_per_tipo[tipo] = 0
                errori_per_tipo[tipo] += 1
            
            for tipo, count in sorted(errori_per_tipo.items(), key=lambda x: x[1], reverse=True):
                print(f"  - {tipo}: {count}")
    else:
        print("\nAnalisi terminata senza risultati. Controlla i messaggi di errore.")

if __name__ == "__main__":
    main()