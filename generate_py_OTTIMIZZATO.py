# File: agent/component/generate.py
# SEZIONE DA AGGIUNGERE dopo la riga 261 (inizio del metodo _run)

def analyze_query_intent(question: str) -> dict:
    """
    Analizza l'intento della domanda per guidare meglio la risposta.
    Distingue tra richieste penali, amministrative, procedurali, normative.
    """
    if not question:
        return {}
    
    question_lower = question.lower()
    
    intent = {
        "richiede_conseguenze_penali": any(word in question_lower for word in [
            "pena", "reato", "penale", "reclusione", "carcere", "condanna",
            "sanzione penale", "responsabilità penale", "procedimento penale",
            "penalmente", "reato tributario", "denuncia penale"
        ]),
        "richiede_conseguenze_amministrative": any(word in question_lower for word in [
            "sanzione amministrativa", "ammenda", "multa amministrativa", 
            "interessi", "sanzione pecuniaria", "ravvedimento"
        ]),
        "richiede_procedure": any(word in question_lower for word in [
            "procedura", "come funziona", "iter", "passaggi", "processo",
            "come si fa", "quali sono i passi", "modalità"
        ]),
        "richiede_normativa": any(word in question_lower for word in [
            "normativa", "legge", "decreto", "articolo", "comma", "d.lgs",
            "dlgs", "d.p.r.", "dpr", "circolare", "risoluzione"
        ]),
        "richiede_giurisprudenza": any(word in question_lower for word in [
            "sentenza", "giurisprudenza", "cassazione", "ctr", "ctp",
            "orientamento", "precedente"
        ])
    }
    
    return intent


def build_intent_instructions(intent: dict) -> str:
    """
    Costruisce istruzioni specifiche basate sull'intento identificato.
    """
    instructions = []
    
    if intent.get("richiede_conseguenze_penali"):
        instructions.append("""
⚠️ ATTENZIONE: La domanda riguarda CONSEGUENZE PENALI (non amministrative).
Focus richiesto su:
- Reati tributari (es. dichiarazione fraudolenta, omessa dichiarazione, omesso versamento)
- Soglie di punibilità (importi che configurano reato)
- Pene detentive (reclusione) e accessorie
- Riferimenti agli articoli 2-11 del D.Lgs 74/2000 (reati tributari)
- Art. 10-bis e 10-ter (omesso versamento, indebita compensazione)
- NON confondere con sanzioni amministrative/pecuniarie!
""")
    
    if intent.get("richiede_conseguenze_amministrative"):
        instructions.append("""
Focus su SANZIONI AMMINISTRATIVE:
- Sanzioni pecuniarie e interessi
- Ravvedimento operoso
- Rateizzazione
- Distingui chiaramente da conseguenze penali
""")
    
    if intent.get("richiede_procedure"):
        instructions.append("""
Risposta richiesta: PROCEDURALE e STEP-BY-STEP
- Fornisci una sequenza chiara e ordinata di passaggi
- Indica tempistiche se disponibili
- Specifica soggetti coinvolti e competenze
""")
    
    if intent.get("richiede_normativa"):
        instructions.append("""
Focus su NORMATIVA:
- Cita articoli e commi specifici
- Indica decreto/legge di riferimento
- Specifica eventuali modifiche o abrogazioni
""")
    
    if intent.get("richiede_giurisprudenza"):
        instructions.append("""
Focus su GIURISPRUDENZA:
- Indica numero e anno sentenze
- Specifica se orientamento consolidato o minoritario
- Evidenzia eventuali contrasti giurisprudenziali
""")
    
    return "\n".join(instructions) if instructions else ""


# =========================================================================
# MODIFICA DELLA FUNZIONE _run (riga ~262)
# Sostituire la sezione tra riga 262 e 375 con questa versione ottimizzata:
# =========================================================================

def _run(self, history, **kwargs):
    chat_mdl = LLMBundle(self._canvas.get_tenant_id(), LLMType.CHAT, self._param.llm_id)
    prompt = self._param.prompt

    retrieval_res = []
    doc_chunks = {}
    all_chunks = []
    self._param.inputs = []

    # 1. Raccogli i chunk, salva per ogni retrieval la lista chunk nel dict per ordinamento successivo
    for para in self.get_input_elements()[1:]:
        if para["key"].lower().find("begin@") == 0:
            cpn_id, key = para["key"].split("@")
            for p in self._canvas.get_component(cpn_id)["obj"]._param.query:
                if p["key"] == key:
                    kwargs[para["key"]] = p.get("value", "")
                    self._param.inputs.append(
                        {"component_id": para["key"], "content": kwargs[para["key"]]})
                    break
            else:
                assert False, f"Can't find parameter '{key}' for {cpn_id}"
            continue

        component_id = para["key"]
        cpn = self._canvas.get_component(component_id)["obj"]
        if cpn.component_name.lower() == "answer":
            hist = self._canvas.get_history(1)
            if hist:
                hist = hist[0]["content"]
            else:
                hist = ""
            kwargs[para["key"]] = hist
            continue
        _, out = cpn.output(allow_partial=False)
        if "content" not in out.columns:
            kwargs[para["key"]] = ""
        else:
            if cpn.component_name.lower() == "retrieval":
                retrieval_res.append(out)
                chunks_list = []
                if "chunks" in out.columns:
                    for chunk_json in out["chunks"]:
                        try:
                            cks = json.loads(chunk_json)
                            all_chunks.extend(cks)
                            chunks_list.extend(cks)
                        except Exception as e:
                            print(f"Errore parsing chunk JSON: {e}")
                doc_chunks[component_id] = chunks_list
            kwargs[para["key"]] = "  - " + "\n - ".join(
                [o if isinstance(o, str) else str(o) for o in out["content"]])
        self._param.inputs.append({"component_id": para["key"], "content": kwargs[para["key"]]})

    # DEBUG: Log cosa ha ricevuto il Generate
    logging.info(f"[GENERATE-DEBUG] {self._id} - kwargs keys: {list(kwargs.keys())}")
    logging.info(f"[GENERATE-DEBUG] {self._id} - history length: {len(history)}")
    if history:
        logging.info(f"[GENERATE-DEBUG] {self._id} - last 3 history items: {history[-3:]}")
    
    for k, v in kwargs.items():
        if isinstance(v, str):
            logging.info(f"[GENERATE-DEBUG] {self._id} - {k}: {v[:200]}...")
        else:
            logging.info(f"[GENERATE-DEBUG] {self._id} - {k}: {type(v)}")
    
    logging.info(f"[GENERATE-DEBUG] {self._id} - retrieval_res count: {len(retrieval_res)}")
    logging.info(f"[GENERATE-DEBUG] {self._id} - all_chunks count: {len(all_chunks)}")
    
    # ========================================================================
    # NUOVO: Analizza l'intento della domanda
    # ========================================================================
    last_user_question = ""
    if history:
        for role, content in reversed(history):
            if role == "user":
                last_user_question = content
                break
    
    query_intent = analyze_query_intent(last_user_question)
    intent_instructions = build_intent_instructions(query_intent)
    
    logging.info(f"[GENERATE-DEBUG] {self._id} - query_intent: {query_intent}")
    logging.info(f"[GENERATE-DEBUG] {self._id} - intent_instructions present: {bool(intent_instructions)}")
    
    # 2. ORDINA I TAG SECONDO L'ORDINE DEI TAG NEL PROMPT
    prompt_tags = re.findall(r"\{Retrieval:([a-zA-Z0-9_]+)\}", prompt)
    logging.info(f"[GENERATE-DEBUG] {self._id} - prompt_tags found: {prompt_tags}")
    
    ordered_chunks = []
    for tag in prompt_tags:
        key = f"Retrieval:{tag}"
        if key in doc_chunks:
            ordered_chunks.extend(doc_chunks[key])

    # ----------------- NEW: tieni un solo chunk per PDF -------------
    uniq_chunks, seen_docs = [], set()
    for ck in ordered_chunks:            # mantiene l'ordine
        d_id = ck.get("doc_id")
        if d_id in seen_docs:
            continue
        uniq_chunks.append(ck)
        seen_docs.add(d_id)

    ordered_chunks = uniq_chunks
    # ----------------------------------------------------------------

    # ========================================================================
    # NUOVO: Aggiungi analisi quantitativa e istruzioni contestuali
    # ========================================================================
    num_chunks = len(ordered_chunks)
    num_unique_docs = len(set([ck.get("doc_id") for ck in ordered_chunks]))
    
    # Costruisci preambolo informativo
    info_context = f"""
═══════════════════════════════════════════════════════════════
INFORMAZIONI DISPONIBILI NEL CONTESTO
═══════════════════════════════════════════════════════════════
• Documenti unici trovati: {num_unique_docs}
• Frammenti totali disponibili: {num_chunks}
• Copertura informativa: {"✓ SUFFICIENTE" if num_chunks >= 3 else "⚠ LIMITATA ma UTILIZZABILE"}

ISTRUZIONI OPERATIVE FONDAMENTALI:
───────────────────────────────────────────────────────────────
1. USA SEMPRE i documenti trovati, anche se pochi
2. CITA SEMPRE le fonti pertinenti usando i marker ##N$$
3. Se hai informazioni parziali: forniscile COMUNQUE indicando i limiti
4. NON dire mai "non ci sono informazioni" se hai trovato documenti pertinenti
5. Con 1 solo documento: inizia con "Basandomi sul documento disponibile..."
6. Con info incomplete: "Dalle sentenze emerge che... [fornisci ciò che hai]"

{intent_instructions}
═══════════════════════════════════════════════════════════════
"""

    # Costruisci tabella mapping e sezione documenti
    docs_table = "╔═════════════════════════════════════════════════════════════╗\n"
    docs_table += "║ TABELLA MARKER/DOCUMENTO (Riferimento obbligatorio)       ║\n"
    docs_table += "╠═════════════════════════════════════════════════════════════╣\n"
    
    for idx, ck in enumerate(ordered_chunks):
        doc_name = ck.get("doc_name") or ck.get("docnm_kwd") or ck.get("document_name", "Documento senza nome")
        docs_table += f"║ ##{idx+1}$$  →  {doc_name[:50]:<50} ║\n"
    
    docs_table += "╚═════════════════════════════════════════════════════════════╝\n"

    # Costruisci la sezione documenti completa
    docs_section = info_context + "\n" + docs_table + "\n\n"
    docs_section += "═══════════════════════════════════════════════════════════════\n"
    docs_section += "DOCUMENTI COMPLETI (Usali per rispondere!)\n"
    docs_section += "═══════════════════════════════════════════════════════════════\n\n"
    
    for idx, ck in enumerate(ordered_chunks):
        doc_name = ck.get("doc_name") or ck.get("docnm_kwd") or ck.get("document_name", "")
        testo = ck.get('content_ltks','') or ck.get('content','')
        docs_section += (
            f"\n┌─── DOCUMENTO ##{idx+1}$$ ───────────────────────────────────┐\n"
            f"│ Titolo: {doc_name}\n"
            f"│ Marker da usare nella risposta: ##{idx+1}$$\n"
            f"└────────────────────────────────────────────────────────────┘\n"
            f"{testo}\n"
            f"└─── FINE DOCUMENTO ##{idx+1}$$ ──────────────────────────────┘\n\n"
        )

    # Sostituisci il segnaposto con la knowledge dinamica
    prompt = prompt.replace("__DOCS_SECTION__", docs_section)

    # Debug file
    import os
    DEBUG_PATH = "/tmp/generate_debug.txt"
    with open(DEBUG_PATH, "w", encoding="utf-8") as f:
        f.write("====== KWARGS KEYS ======\n")
        f.write(str(list(kwargs.keys())) + "\n")
        f.write("====== QUERY INTENT ======\n")
        f.write(str(query_intent) + "\n")
        f.write("====== NUM CHUNKS ======\n")
        f.write(f"Total: {num_chunks}, Unique docs: {num_unique_docs}\n")
        f.write("====== PROMPT FINAL ======\n")
        f.write(prompt[:5000] + "\n[TRUNCATED...]")

    # 5. Riassegna unified_id in modo progressivo SOLO a quelli usati effettivamente:
    for new_id, chunk in enumerate(ordered_chunks):
        chunk["unified_id"] = new_id

    # 6. Stream output subito (come sempre prima della generazione normale)
    downstreams = self._canvas.get_component(self._id)["downstream"]
    if kwargs.get("stream") and len(downstreams) == 1 and self._canvas.get_component(
        downstreams[0])["obj"].component_name.lower() == "answer":
        return partial(self.stream_output, chat_mdl, prompt, ordered_chunks)

    # 7. Prepara messaggi e chiama il modello
    msg = self._canvas.get_history(self._param.message_history_window_size)
    if len(msg) < 1:
        msg.append({"role": "user", "content": "Output: "})
    _, msg = message_fit_in([{"role": "system", "content": prompt}, *msg], int(chat_mdl.max_length * 0.97))
    if len(msg) < 2:
        msg.append({"role": "user", "content": "Output: "})
    ans = chat_mdl.chat(msg[0]["content"], msg[1:], self._param.gen_conf())
    ans = re.sub(r"<think>.*</think>", "", ans, flags=re.DOTALL)

    if self._param.cite:
        res = self.set_cite(ordered_chunks, ans)     # Usa i chunks ordinati per le citazioni e i PDF!
        return pd.DataFrame([res])

    # Fallback se non cita
    return Generate.be_output(ans)

