import os
import json
import re
from elasticsearch import Elasticsearch
from elasticsearch.helpers import scan, bulk
from rich.console import Console
from rich.prompt import Confirm, Prompt
from rich.progress import track

# =========== CONFIG PRINCIPALE =============
DEFAULT_INDICE = "ragflow_20006_6shard"
DEFAULT_ES_HOST = "http://localhost:1200"
DEFAULT_ES_USER = "elastic"
DEFAULT_ES_PASS = "infini_rag_flow"
FIELD = "docnm_kwd"
CHECKPOINT_FILE_DEFAULT = "log_duplicati_final.jsonl"
STEP_CHECKPOINT = 10000

console = Console()

def stem_filename(name):
    name = name.strip()
    name = re.sub(r' - .+(?=\.[pP][dD][fF]$)', '', name)
    name = re.sub(r' \(\d+\)(?=\.[pP][dD][fF]$)', '', name)
    name = re.sub(r'\.[pP][dD][fF]$', '', name)
    return name.lower()

def base_filename(name):
    return stem_filename(name) + ".pdf"

def analizza_duplicati(docs_by_stem):
    riassunto = []
    for stem, docs in docs_by_stem.items():
        if len(docs) > 1:
            candidati = [d for d in docs if re.match(r'^[^.() ]+\.pdf$', d[1], re.IGNORECASE)]
            if candidati:
                keep = candidati[0]
            else:
                keep = docs[0]
            canc = [d for d in docs if d != keep]
            gruppo = {
                'stem': stem,
                'conservato': keep[1],
                'conservato_id': keep[0],
                'cancellati': [cc[1] for cc in canc],
                'cancellati_id': [cc[0] for cc in canc]
            }
            riassunto.append(gruppo)
    return riassunto

def salva_checkpoint(riassunto, filename):
    with open(filename, "w", encoding="utf8") as f:
        for line in riassunto:
            f.write(json.dumps(line, ensure_ascii=False) + "\n")
    console.print(f"[green]Checkpoint salvato ({len(riassunto)} gruppi) su {filename}[/green]")

def carica_checkpoint(filename):
    if not os.path.exists(filename):
        return []
    dati = []
    with open(filename, encoding="utf8") as f:
        for r in f:
            if r.strip():
                dati.append(json.loads(r))
    return dati

def mostra_riassunto(riassunto, max_per_view=10):
    numgr = len(riassunto)
    num_dup = sum(len(g['cancellati']) for g in riassunto)
    num_tot_in_gruppi = sum(1 + len(g['cancellati']) for g in riassunto)
    console.print(f'[yellow]Trovati {numgr} gruppi di duplicati[/yellow]')
    console.print(f'[red]Totale file duplicati da cancellare: {num_dup}[/red]')
    console.print(f'[blue]Totale file coinvolti nei gruppi (da cancellare + buoni): {num_tot_in_gruppi}[/blue]')
    if numgr == 0:
        return
    for i, g in enumerate(riassunto):
        console.print(f"\n[b]{i + 1} - Gruppo:[/b] [cyan]{g['stem']}[/cyan]")
        console.print(f"   [bold green]TENUTO:[/bold green]     {g['conservato']}")
        for c in g['cancellati']:
            console.print(f"   [red]CANCELLA:[/red]   {c}")
        if (i + 1) >= max_per_view:
            if Confirm.ask(f"Mostrati {max_per_view} su {numgr}, continua a mostrare?"):
                continue
            else:
                break

def cancella_duplicati(es, riassunto, indice):
    tot_del = 0
    for g in track(riassunto, description="Cancellazione gruppi doc"):
        for del_id in g['cancellati_id']:
            es.delete(index=indice, id=del_id, ignore=[404])
            tot_del += 1
    console.print(f"[bold red]Cancellati {tot_del} documenti duplicati![/bold red]")

def cancella_duplicati_per_docid_batch(es, riassunto, indice, batch_size=200):
    tot_del = 0
    from itertools import islice

    # Estrai tutti i doc_id da cancellare
    doc_ids = []
    for g in riassunto:
        doc_ids.extend(g['cancellati_id'])

    it = iter(doc_ids)
    for batch in iter(lambda: list(islice(it, batch_size)), []):
        query = {"terms": {"doc_id": batch}}
        res = es.delete_by_query(index=indice, query=query, ignore=[404, 409], refresh=True, conflicts="proceed")
        n_del = res.get('deleted', 0)
        tot_del += n_del
        console.print(f"[dim]Batch cancellati: {n_del} documenti[/dim]")

    console.print(f"[bold yellow]Cancellati in totale {tot_del} documenti duplicati via doc_id (batch)![/bold yellow]")

def rinomina_keep(es, riassunto, indice):
    for g in track(riassunto, description="Aggiorno nomi dei documenti buoni"):
        wanted_name = base_filename(g['conservato'])
        doc_id = g['conservato_id']
        current_name = g['conservato']
        if current_name.lower() != wanted_name:
            try:
                es.update(index=indice, id=doc_id, doc={FIELD: wanted_name})
            except Exception as ex:
                console.print(f"[red]Errore aggiornamento nome {doc_id}: {ex}[/red]")

def cerca_duplicati(es, indice, step_checkpoint, checkpoint_file):
    console.print("[cyan]→ Cerco e raggruppo i documenti per nome base...[/cyan]")
    size_query = es.count(index=indice)
    totali = size_query['count']
    docs_by_stem = {}
    checked = 0

    for doc in track(
        scan(es, index=indice, _source_includes=[FIELD, "doc_id"], scroll='5m'),
        description="Scansione...",
        total=totali
    ):
        fn = doc['_source'].get(FIELD)
        docid = doc['_source'].get('doc_id', doc['_id'])
        if not fn:
            continue
        stem = stem_filename(fn)
        docs_by_stem.setdefault(stem, []).append((docid, fn))
        checked += 1

        if checked % step_checkpoint == 0:
            riassunto = analizza_duplicati(docs_by_stem)
            salva_checkpoint(riassunto, checkpoint_file)
            console.print(f"[yellow]Checkpoint dopo {checked} file[/yellow]")

    riassunto = analizza_duplicati(docs_by_stem)
    salva_checkpoint(riassunto, checkpoint_file)
    console.print("[green]Checkpoint finale completato[/green]")
    return docs_by_stem

def mostra_report_duplicati(filename):
    riassunto = carica_checkpoint(filename)
    numgr = len(riassunto)
    num_dup = sum(len(g['cancellati']) for g in riassunto)
    num_tot_in_gruppi = sum(1 + len(g['cancellati']) for g in riassunto)
    console.print(f"\n[bold magenta]=== REPORT DUPLICATI ===[/bold magenta]")
    console.print(f'[yellow]Gruppi di duplicati trovati: {numgr}[/yellow]')
    console.print(f'[red]File duplicati da cancellare: {num_dup}[/red]')
    console.print(f'[blue]File coinvolti totali (da cancellare + buoni): {num_tot_in_gruppi}[/blue]')
    if numgr > 0:
        console.print(f'[green]File buoni totali (da mantenere): {numgr}[/green]')
    console.print(f"[magenta]Log checkpoint: {filename}[/magenta]\n")

def trova_indice_chunk(es):
    res = es.cat.indices(format="json")
    candidati = []
    for idx in res:
        name = idx['index']
        try:
            mapping = es.indices.get_mapping(index=name)
            props = mapping[name]['mappings'].get('properties', {})
            if 'doc_id' in props:
                candidati.append(name)
        except Exception:
            continue
    if not candidati:
        console.print("[red]Nessun indice chunk trovato automaticamente! Inserisci tu il nome?[/red]")
        idx = Prompt.ask("Nome indice chunk")
        return idx
    elif len(candidati) == 1:
        return candidati[0]
    else:
        console.print(f"[yellow]Trovati più indici che potrebbero essere chunk: {candidati}")
        idx = Prompt.ask(f"Quale vuoi usare?", choices=candidati)
        return idx

def cancella_chunk_doppi(es, riassunto, indice, indice_chunk):
    n_chunks_cancellati = 0
    n_docs_cancellati = 0
    for g in track(riassunto, description="Deduplica chunk e doc"):
        del_doc_ids = g['cancellati_id']
        for doc_id in del_doc_ids:
            query = { "query": { "term": { "doc_id": doc_id } } }
            try:
                res = es.delete_by_query(index=indice_chunk, body=query, ignore=[404, 409], refresh=True, conflicts="proceed")
                deleted = res.get('deleted', 0)
                n_chunks_cancellati += deleted
                console.print(f"[dim]Canc chunk doc_id={doc_id}: {deleted} chunk[/dim]")
            except Exception as ex:
                console.print(f"[red]Errore delete chunk per doc_id {doc_id}: {ex}[/red]")
            try:
                es.delete(index=indice, id=doc_id, ignore=[404])
                n_docs_cancellati += 1
            except Exception as ex:
                console.print(f"[red]Errore delete doc duplicato id {doc_id}: {ex}[/red]")
    console.print(f"[green]Cancellati {n_chunks_cancellati} chunk duplicati e {n_docs_cancellati} documenti duplicati![/green]")

def cancella_solo_docs_duplicati(es, riassunto, indice, batch_size=1000):
    from elasticsearch.helpers import bulk
    doc_ids = []
    for g in riassunto:
        doc_ids.extend(g['cancellati_id'])
    n_tot = len(doc_ids)
    n_cancellati = 0

    for i in range(0, n_tot, batch_size):
        batch = doc_ids[i:i+batch_size]
        azioni = [{'_op_type': 'delete', '_index': indice, '_id': doc_id} for doc_id in batch]
        success, _ = bulk(es, azioni, raise_on_error=False, request_timeout=30000)
        n_cancellati += success
        console.print(f"[cyan]Progress: eliminati {n_cancellati}/{n_tot} doc ({100.0*n_cancellati/n_tot:.2f}%)...[/cyan]")
    console.print(f"[bold yellow]Cancellati TUTTI {n_cancellati} documenti duplicati dall'indice principale![/bold yellow]")

def cancella_chunk_orfani(es, indice_chunk, indice_doc, show_sample=5):
    console.print("[blue]→ Ricavo elenco doc_id esistenti nell'indice documenti...[/blue]")
    doc_ids = set()
    for doc in track(scan(es, index=indice_doc, _source_includes=["doc_id"], scroll='10m'), description="Scan doc id"):
        doc_ids.add(str(doc['_source'].get('doc_id', doc['_id'])))
    console.print(f"[green]Trovati {len(doc_ids)} doc_id nell'indice documenti.[/green]")

    n_orfani = 0
    n_cancellati = 0
    samples = []
    for chunk in track(scan(es, index=indice_chunk, _source_includes=["doc_id"], scroll='10m'), description="Cerca chunk orfani"):
        chunk_doc_id = str(chunk['_source'].get('doc_id'))
        if chunk_doc_id and chunk_doc_id not in doc_ids:
            if len(samples) < show_sample:
                samples.append((chunk['_id'], chunk_doc_id))
            try:
                es.delete(index=indice_chunk, id=chunk['_id'], ignore=[404])
                n_cancellati += 1
            except Exception as ex:
                console.print(f"[red]Errore delete chunk orfano id {chunk['_id']} (doc_id={chunk_doc_id}): {ex}[/red]")
            n_orfani += 1
    if samples:
        console.print("[dim]Esempi chunk orfani cancellati:[/dim]")
        for _id, doc_id in samples:
            console.print(f" - chunk_id: {_id}, doc_id: {doc_id}")
    console.print(f"[bold yellow]Cancellati {n_cancellati} chunk orfani![/bold yellow]")

def scegli_checkpoint():
    return CHECKPOINT_FILE_DEFAULT

def main():
    es_host = DEFAULT_ES_HOST
    es_user = DEFAULT_ES_USER
    es_pass = DEFAULT_ES_PASS
    indice = DEFAULT_INDICE
    checkpoint_file = CHECKPOINT_FILE_DEFAULT
    es = Elasticsearch(es_host, basic_auth=(es_user, es_pass), verify_certs=False)
    indice_chunk = trova_indice_chunk(es)
    console.print(f"[green]Userò l’indice chunk: {indice_chunk}[/green]")
    while True:
        console.print("\n[bold blue]--- MENÙ DUPLICATI ELASTIC ---[/bold blue]")
        opzioni = [
            "1. Analizza e salva duplicati",
            "2. Mostra duplicati trovati su file",
            "3. Rinomina documento 'buono' (base .pdf)",
            "4. Cancella duplicati trovati su file",
            "5. Esci",
            "6. Mostra solo il report numerico dei duplicati",
            "7. Cancella chunk+doc duplicati",
            "8. SOLO cancella doc duplicati (index principale, NON chunk)",
            "9. SOLO cancella tutti i chunk orfani (chunk senza doc_id 'vivo')",
            "10. --- CANCELLALI DAVVERO via campo doc_id (LENTO, sicuro) ---"
        ]
        for op in opzioni:
            console.print(op)
        scelta = Prompt.ask("\nScegli un'opzione", choices=[str(i) for i in range(1, 11)])
        if scelta == "1":
            docs_by_stem = cerca_duplicati(es, indice, STEP_CHECKPOINT, checkpoint_file)
            riassunto = analizza_duplicati(docs_by_stem)
            mostra_riassunto(riassunto)
        elif scelta == "2":
            riassunto = carica_checkpoint(filename=checkpoint_file)
            mostra_riassunto(riassunto)
        elif scelta == "3":
            riassunto = carica_checkpoint(filename=checkpoint_file)
            if not riassunto:
                console.print("[red]Nessun log valido. Esegui prima analisi.[/red]")
                continue
            mostra_riassunto(riassunto, max_per_view=5)
            if Confirm.ask("\nVuoi aggiornare i nomi dei documenti 'buoni' con il nome base senza timestamp né (n)?"):
                rinomina_keep(es, riassunto, indice)
                console.print("[green]Rinominati i doc conservati[/green]")
            else:
                console.print("[yellow]Rinominare annullato[/yellow]")
        elif scelta == "4":
            riassunto = carica_checkpoint(filename=checkpoint_file)
            if not riassunto:
                console.print("[red]Nessun log valido. Esegui prima analisi.[/red]")
                continue
            mostra_riassunto(riassunto, max_per_view=5)
            if Confirm.ask("\nVuoi DAVVERO cancellare questi duplicati?"):
                cancella_duplicati(es, riassunto, indice)
            else:
                console.print("[yellow]Cancellazione annullata![/yellow]")
        elif scelta == "5":
            break
        elif scelta == "6":
            mostra_report_duplicati(filename=checkpoint_file)
        elif scelta == "7":
            riassunto = carica_checkpoint(filename=checkpoint_file)
            if not riassunto:
                console.print("[red]Nessun checkpoint valido. Lancia prima analisi duplicati.[/red]")
                continue
            mostra_report_duplicati(filename=checkpoint_file)
            if Confirm.ask("\nVuoi procedere con deduplica chunk e documenti? (ATTENZIONE: elimina documenti e tutti i loro chunk duplicati!)"):
                cancella_chunk_doppi(es, riassunto, indice, indice_chunk)
                console.print("[green]Deduplica eseguita.[/green]")
        elif scelta == "8":
            riassunto = carica_checkpoint(filename=checkpoint_file)
            if not riassunto:
                console.print("[red]Nessun checkpoint valido. Lancia prima analisi duplicati.[/red]")
                continue
            mostra_report_duplicati(filename=checkpoint_file)
            if Confirm.ask("\nVuoi procedere SOLO con cancellazione dei documenti duplicati (NON chunk)?"):
                cancella_solo_docs_duplicati(es, riassunto, indice, batch_size=2000)
                console.print("[green]Solo doc duplicati cancellati.[/green]")
        elif scelta == "9":
            if Confirm.ask("Vuoi DAVVERO procedere a cancellare tutti i chunk orfani (chunk senza doc id esistente)?"):
                cancella_chunk_orfani(es, indice_chunk=indice_chunk, indice_doc=indice)
                console.print("[green]Chunk orfani cancellati.[/green]")
        elif scelta == "10":
            riassunto = carica_checkpoint(filename=checkpoint_file)
            if not riassunto:
                console.print("[red]Nessun checkpoint valido. Lancia prima analisi duplicati.[/red]")
                continue
            mostra_report_duplicati(filename=checkpoint_file)
            if Confirm.ask("\nVuoi procedere ALLA CANCELLAZIONE DEI DUPLICATI VERE VIA doc_id con delete_by_query?"):
                cancella_duplicati_per_docid_batch(es, riassunto, indice)
                console.print("[green]DUPLICATI (doc_id) CANCELLATI.[/green]")

if __name__ == "__main__":
    main()