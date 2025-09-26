#
#  Copyright 2024 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#
import json
import re
from functools import partial
import pandas as pd
from api.db import LLMType
from api.db.services.conversation_service import structure_answer
from api.db.services.llm_service import LLMBundle
from api import settings
from agent.component.base import ComponentBase, ComponentParamBase
from rag.prompts import message_fit_in


class GenerateParam(ComponentParamBase):
    """
    Define the Generate component parameters.
    """

    def __init__(self):
        super().__init__()
        self.llm_id = ""
        self.prompt = ""
        self.max_tokens = 0
        self.temperature = 0
        self.top_p = 0
        self.presence_penalty = 0
        self.frequency_penalty = 0
        self.cite = True
        self.parameters = []

    def check(self):
        self.check_decimal_float(self.temperature, "[Generate] Temperature")
        self.check_decimal_float(self.presence_penalty, "[Generate] Presence penalty")
        self.check_decimal_float(self.frequency_penalty, "[Generate] Frequency penalty")
        self.check_nonnegative_number(self.max_tokens, "[Generate] Max tokens")
        self.check_decimal_float(self.top_p, "[Generate] Top P")
        self.check_empty(self.llm_id, "[Generate] LLM")
        # self.check_defined_type(self.parameters, "Parameters", ["list"])

    def gen_conf(self):
        conf = {}
        if self.max_tokens > 0:
            conf["max_tokens"] = self.max_tokens
        if self.temperature > 0:
            conf["temperature"] = self.temperature
        if self.top_p > 0:
            conf["top_p"] = self.top_p
        if self.presence_penalty > 0:
            conf["presence_penalty"] = self.presence_penalty
        if self.frequency_penalty > 0:
            conf["frequency_penalty"] = self.frequency_penalty
        return conf


class Generate(ComponentBase):
    component_name = "Generate"

    def get_dependent_components(self):
        inputs = self.get_input_elements()
        cpnts = set([i["key"] for i in inputs[1:] if i["key"].lower().find("answer") < 0 and i["key"].lower().find("begin") < 0])
        return list(cpnts)

    def set_cite(
        self,
        chunks: list[dict],
        answer: str,
        *,
        avoid_duplicates: bool = True      # True = rimuove marker ripetuti
    ):
        """
        • Inserisce i marker ##N$$ in modo coerente con l’ordine dei chunk.
        • Se avoid_duplicates=True elimina le occorrenze successive di uno
        stesso marker, lasciando solo la prima (utile a non gonfiare il testo).
        """

        # ------------------------------------------------------------------ #
        # 0) Check che ogni chunk abbia 'content_ltks'                       #
        # ------------------------------------------------------------------ #
        missing = [i for i, ck in enumerate(chunks) if "content_ltks" not in ck]
        if missing:
            return {
                "content": f"DEBUG ERROR – chunks senza 'content_ltks': {missing}",
                "reference": {}
            }

        # ------------------------------------------------------------------ #
        # 1) Inserisci automaticamente i marker con insert_citations         #
        # ------------------------------------------------------------------ #
        content_list = [ck["content_ltks"] for ck in chunks]
        vector_list  = [ck.get("vector")  for ck in chunks]

        answer, _ = settings.retrievaler.insert_citations(
            answer,
            content_list,
            vector_list,
            LLMBundle(
                self._canvas.get_tenant_id(),
                LLMType.EMBEDDING,
                self._canvas.get_embedding_model()
            ),
            tkweight=0.7,
            vtweight=0.3
        )

        # ---- NEW: rimuove marker se l'indice supera il n° di chunks ----
        max_id = len(chunks)
        answer = re.sub(
            r'##(\d+)\$\$',
            lambda m: m.group(0) if int(m.group(1)) <= max_id else '',
            answer
        )

        # ---- COMPATTA eventuali ripetizioni consecutive dello stesso marker
        answer = re.sub(r'(##\d+\$\$\s*){2,}',
                        lambda m: m.group(0).split()[0] + ' ',
                        answer)

        # ------------------------------------------------------------------ #
        # 2) Elimina marker duplicati (opzionale)                            #
        # ------------------------------------------------------------------ #
        if avoid_duplicates:
            seen = set()

            def dedup(match):
                marker = match.group(0)          # es. ##12$$
                if marker in seen:
                    return ""                    # sopprime occorrenze 2..n
                seen.add(marker)
                return marker

            answer = re.sub(r'##\d+\$\$', dedup, answer)

        # ------------------------------------------------------------------ #
        # 3) Costruisci doc_aggs 1-a-1 con i chunk (nessuna dedup)           #
        # ------------------------------------------------------------------ #
        # ------------------------------------------------------------------ #
        # 3) Costruisci doc_aggs con URL corretti                            #
        # ------------------------------------------------------------------ #
        doc_aggs = []
        for ck in chunks:
            doc_id = ck.get("doc_id")
            # Costruisci URL se mancante
            url = ck.get("url") or ""
            if not url and doc_id:
                url = f"/v1/document/get/{doc_id}"
            
            doc_aggs.append({
                "doc_id": doc_id,
                "doc_name": ck.get("docnm_kwd") or ck.get("doc_name") or "",
                "file_name": ck.get("file_name") or ck.get("original_name") or ck.get("name") or "",
                "url": url,
                "chunk_preview": (ck.get("content_ltks") or ck.get("content") or "")[:300]
            })



        # ------------------------------------------------------------------ #
        # 4) Trova i marker effettivamente presenti nell'answer              #
        # ------------------------------------------------------------------ #
        cited_indices = set()
        invalid_markers = []

        for m in re.finditer(r'##(\d+)\$\$', answer):
            marker_num = int(m.group(1))
            idx = marker_num - 1
            
            if 0 <= idx < len(chunks):
                cited_indices.add(idx)
            else:
                invalid_markers.append(marker_num)
                print(f"[set_cite WARNING] Marker ##${marker_num}$$ fuori range (max chunks: {len(chunks)})")

        # Fallback: se nessun marker valido, usa tutti i chunks
        if not cited_indices:
            print(f"[set_cite WARNING] Nessun marker valido trovato. Usando tutti i {len(chunks)} chunks.")
            cited_indices = set(range(len(chunks)))

        # ------------------------------------------------------------------ #
        # 5) Filtra chunks e doc_aggs                                        #
        # ------------------------------------------------------------------ #
        filtered_chunks = [chunks[i] for i in sorted(cited_indices)]
        filtered_doc_aggs = [doc_aggs[i] for i in sorted(cited_indices)]

        # ------------------------------------------------------------------ #
        # 6) Crea mapping vecchio_indice -> nuovo_indice                     #
        # ------------------------------------------------------------------ #
        old_to_new = {}
        for new_idx, old_idx in enumerate(sorted(cited_indices), start=1):
            old_to_new[old_idx + 1] = new_idx

        # ------------------------------------------------------------------ #
        # 7) Remap marker nel testo                                          #
        # ------------------------------------------------------------------ #
        def remap_marker(match):
            old_num = int(match.group(1))
            new_num = old_to_new.get(old_num)
            if new_num is None:
                print(f"[set_cite WARNING] Marker ##${old_num}$$ non trovato nel mapping, rimosso")
                return ''
            return f'##{new_num}$$'

        answer = re.sub(r'##(\d+)\$\$', remap_marker, answer)

        # ------------------------------------------------------------------ #
        # 8) Legenda "Fonti" con indici remappati                            #
        # ------------------------------------------------------------------ #
        legend_lines = ["**Fonti:**"]
        for new_idx, doc in enumerate(filtered_doc_aggs, start=1):
            legend_lines.append(f"- ##{new_idx}$$ {doc['doc_name']}")

        if len(legend_lines) > 1:
            answer += "\n\n" + "\n".join(legend_lines)

        # ------------------------------------------------------------------ #
        # 9) Pacchetto finale                                                #
        # ------------------------------------------------------------------ #
        reference = {"chunks": filtered_chunks, "doc_aggs": filtered_doc_aggs}
        res = {"content": answer, "reference": reference}
        return structure_answer(None, res, "", "")

        

    def get_input_elements(self):
        key_set = set([])
        res = [{"key": "user", "name": "Input your question here:"}]
        for r in re.finditer(r"\{([a-z]+[:@][a-z0-9_-]+)\}", self._param.prompt, flags=re.IGNORECASE):
            cpn_id = r.group(1)
            if cpn_id in key_set:
                continue
            if cpn_id.lower().find("begin@") == 0:
                cpn_id, key = cpn_id.split("@")
                for p in self._canvas.get_component(cpn_id)["obj"]._param.query:
                    if p["key"] != key:
                        continue
                    res.append({"key": r.group(1), "name": p["name"]})
                    key_set.add(r.group(1))
                continue
            cpn_nm = self._canvas.get_component_name(cpn_id)
            if not cpn_nm:
                continue
            res.append({"key": cpn_id, "name": cpn_nm})
            key_set.add(cpn_id)
        return res


  
    def _run(self, history, **kwargs):
        chat_mdl = LLMBundle(self._canvas.get_tenant_id(), LLMType.CHAT, self._param.llm_id)
        prompt = self._param.prompt

        retrieval_res = []
        doc_chunks = {}
        all_chunks = []
        self._param.inputs = []

        with open("/tmp/generate_debug.txt", "a", encoding="utf-8") as f:
            f.write("\n==== PROMPT FINALE DA PASSARE AL LLM ====\n")
            f.write(prompt)

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

        # 2. ORDINA I TAG SECONDO L'ORDINE DEI TAG NEL PROMPT
        prompt_tags = re.findall(r"\{Retrieval:([a-zA-Z0-9_]+)\}", prompt)
        ordered_chunks = []
        for tag in prompt_tags:
            key = f"Retrieval:{tag}"
            if key in doc_chunks:
                ordered_chunks.extend(doc_chunks[key])

        # ----------------- NEW: tieni un solo chunk per PDF -------------
        uniq_chunks, seen_docs = [], set()
        for ck in ordered_chunks:            # mantiene l’ordine
            d_id = ck.get("doc_id")
            if d_id in seen_docs:
                continue
            uniq_chunks.append(ck)
            seen_docs.add(d_id)

        ordered_chunks = uniq_chunks
        # ----------------------------------------------------------------

        docs_section = ""
        docs_table = "Tabella mapping marker/documento da usare (IMPORTANTE, copiato sotto ogni documento!):\n"
        for idx, ck in enumerate(ordered_chunks):
            doc_name = ck.get("doc_name") or ck.get("docnm_kwd") or ck.get("document_name", "")
            docs_table += f"##{idx+1}$$  ->  {doc_name}\n"

        docs_section = docs_table + "\n"
        for idx, ck in enumerate(ordered_chunks):
            doc_name = ck.get("doc_name") or ck.get("docnm_kwd") or ck.get("document_name", "")
            testo = ck.get('content_ltks','') or ck.get('content','')
            docs_section += (
                f"\n>>> INIZIO DOCUMENTO MARKER ##{idx+1}$$ ({doc_name}) <<<\n"
                f"Quando citi questo documento, usa sempre il marker ##{idx+1}$$ e scrivi il nome '{doc_name}' nel testo.\n"
                f"{testo}\n"
                f">>> FINE DOCUMENTO ##{idx+1}$$ ({doc_name}) <<<\n"
    )

        # Sostituisci il segnaposto scelto con la knowledge dinamica calcolata nel backend
        prompt = prompt.replace("__DOCS_SECTION__", docs_section)   # se usi __DOCS_SECTION__
        # prompt = prompt.replace("{docs_section}", docs_section)    # oppure se usi {docs_section}


        # 3. AGGIORNA kwargs con knowledge aggregata per ciascun tag 
        #for tag_i, tag in enumerate(prompt_tags):
        #    key = f"Retrieval:{tag}"
        #    docnum = tag_i + 1
        #    doc_chunk_list = doc_chunks.get(key, [])
        #    if doc_chunk_list:
        #        doc_name = doc_chunk_list[0].get('doc_name', '') or doc_chunk_list[0].get('docnm_kwd', '')
        #        joined = f"\n--- DOCUMENTO {docnum} ({doc_name}) ---\n"
        #        joined += f"\n".join([(ck.get('content_ltks','') or ck.get('content','')) for ck in doc_chunk_list])
        #        joined += f"\n--- FINE DOCUMENTO {docnum} ---\n"
        #    else:
        #        joined = ""
        #    kwargs[key] = joined

        # —> QUI il debug file, UNA SOLA VOLTA <—
        import os
        DEBUG_PATH = "/tmp/generate_debug.txt"
        with open(DEBUG_PATH, "w", encoding="utf-8") as f:
            f.write("====== KWARGS KEYS ======\n")
            f.write(str(list(kwargs.keys())) + "\n")
            f.write("====== KWARGS (DET) ======\n")
            for k, v in kwargs.items():
                f.write(f"\n--- {k} ---\n")
                try:
                    v_str = str(v)
                    if len(v_str) > 500:
                        f.write(v_str[:500] + "\n[TRUNCATED]\n")
                    else:
                        f.write(v_str)
                except Exception as e:
                    f.write(f"<<v non stringa, type={type(v)}, err={e}>>\n")
                f.write("\n")
            f.write("====== PROMPT TAGS (order) ======\n")
            f.write(str(prompt_tags) + "\n")
            f.write("====== PROMPT (pre replace) ======\n")
            f.write(prompt + "\n\n")
            f.write("====== CHUNKS COUNT PER TAG ======\n")
            for k in doc_chunks.keys():
                f.write(f"{k}: {len(doc_chunks[k])} chunks\n")
            f.write("====== ordered_chunks LEN ======\n")
            f.write(str(len(ordered_chunks)) + "\n")

        # 4. SOSTITUZIONE PLACEHOLDER!
        #for n, v in kwargs.items():
        #    pattern = r"\s*\{%s\}\s*" % re.escape(n)
        #    count_replacements = len(re.findall(pattern, prompt))
        #    if count_replacements == 0:
        #        with open(DEBUG_PATH, "a", encoding="utf-8") as f:
        #            f.write(f"\n[PLACEHOLDER WARNING] Placeholder {{{n}}} NON TROVATO nel prompt. (Possibili spazi o newline strani?)\n")
        #    else:
        #        with open(DEBUG_PATH, "a", encoding="utf-8") as f:
        #            f.write(f"\n[SOSTITUZIONE ESEGUITA] Placeholder {{{n}}} trovato {count_replacements} volta/e, knowledge inserita.\n")
        #    prompt = re.sub(pattern, "\n" + str(v).replace("\\", " ") + "\n", prompt)

        # AGGIUNGI SUBITO DOPO: salva il prompt finale post-sostituzione
        with open(DEBUG_PATH, "a", encoding="utf-8") as f:
            f.write("\n==== PROMPT POST REPLACE ====\n")
            f.write(prompt)  # SCRIVE TUTTO IL PROMPT, intero!

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
    
    def stream_output(self, chat_mdl, prompt, ordered_chunks):
        answer = ""
        for ans in chat_mdl.chat_streamly(prompt, [], self._param.gen_conf()):
            res = {"content": ans, "reference": []}
            answer = ans
            yield res

        # Alla fine del flusso stream, calcola l'output con le citazioni
        if self._param.cite:
            res = self.set_cite(ordered_chunks, answer)
            yield res

        self.set_output(Generate.be_output(res))