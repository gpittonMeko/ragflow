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

    def set_cite(self, chunks, answer):
        # DEBUG: Accumula tutti i chunk privi di content_ltks
        missing_content_ltks = []
        for idx, ck in enumerate(chunks):
            if "content_ltks" not in ck:
                missing_content_ltks.append({"index": idx, "keys": list(ck.keys()), "data": ck})

        # SE CE NE SONO, forzano errore e mostrano in chiaro in output (così li vedi nel browser/UI!) 
        if missing_content_ltks:
            return {
                "content": f"ERROR DEBUG: chunk(s) missing 'content_ltks': {json.dumps(missing_content_ltks, indent=2, ensure_ascii=False)}",
                "reference": {}
            }

        content_ltks_list = [ck.get("content_ltks", "") for ck in chunks]
        vector_list = [ck.get("vector", None) for ck in chunks]

        answer, idx = settings.retrievaler.insert_citations(
            answer,
            content_ltks_list,
            vector_list,
            LLMBundle(self._canvas.get_tenant_id(), LLMType.EMBEDDING, self._canvas.get_embedding_model()),
            tkweight=0.7,
            vtweight=0.3
        )





        # 1. Referenze ai documenti EFFETTIVAMENTE citati nei marker (come ora)
        doc_ids = set([])
        recall_docs = []
        for i in idx:
            did = chunks[int(i)]["doc_id"]
            doc_name = chunks[int(i)].get("docnm_kwd") or chunks[int(i)].get("doc_name") or ""
            if did in doc_ids:
                continue
            doc_ids.add(did)
            recall_docs.append({"doc_id": did, "doc_name": doc_name})

        # Ora metti SEMPRE TUTTI i PDF dei chunk, non solo quelli citati
        all_docs = []
        added_doc_ids = set([rec["doc_id"] for rec in recall_docs])
        for ck in chunks:
            did = ck.get("doc_id")
            doc_name = ck.get("docnm_kwd") or ck.get("doc_name") or ""
            if did and did not in added_doc_ids:
                all_docs.append({"doc_id": did, "doc_name": doc_name})
                added_doc_ids.add(did)

        doc_aggs = recall_docs + all_docs  # TUTTI I DOCUMENTI PDF ELENCATI, in ordine finale

        # ---- PATCH MARKER ----
        # Crea la mappa doc_id -> marker numerico progressivo
        docid_to_marker = {rec["doc_id"]: f"##{ix+1}$$" for ix, rec in enumerate(doc_aggs)}

        def remap_markers(answer, chunks, docid_to_marker):
            for idx, ck in enumerate(chunks):
                doc_id = ck.get('doc_id')
                new_marker = docid_to_marker.get(doc_id)
                if new_marker:
                    answer = answer.replace(f"##{idx}$$", new_marker)
            return answer

        # Applica questa funzione sosituendo i vecchi marker
        answer = remap_markers(answer, chunks, docid_to_marker)
        # ---- FINE PATCH MARKER ----

        reference = {
            "chunks": chunks,
            "doc_aggs": doc_aggs
        }
        res = {"content": answer, "reference": reference}
        res = structure_answer(None, res, "", "")
        return res

        # Inserisci sempre tutti i pdf presenti (citati + non citati, unico elenco)
        reference = {
            "chunks": chunks,
            "doc_aggs": recall_docs + all_docs
        }
        if answer.lower().find("invalid key") >= 0 or answer.lower().find("invalid api") >= 0:
            answer += " Please set LLM API-Key in 'User Setting -> Model providers -> API-Key'"
        res = {"content": answer, "reference": reference}
        res = structure_answer(None, res, "", "")
        return res

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
            f.write(prompt[:7000] + ("...[TRUNCATED]..." if len(prompt) > 3000 else ""))

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

        # 3. AGGIORNA kwargs con knowledge aggregata per ciascun tag (opzionale, se vuoi anche una {knowledge_aggregata})
        for tag in prompt_tags:
            key = f"Retrieval:{tag}"
            chunks_text = "\n".join([ck.get('content_ltks','') or ck.get('content','') for ck in doc_chunks.get(key, [])])
            kwargs[key] = chunks_text

            import os

            DEBUG_PATH = "/tmp/generate_debug.txt"  # puoi cambiare path se preferisci

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
                f.write("====== PROMPT (after agg_text replace) ======\n")
                f.write(prompt + "\n\n")
                f.write("====== CHUNKS COUNT PER TAG ======\n")
                for k in doc_chunks.keys():
                    f.write(f"{k}: {len(doc_chunks[k])} chunks\n")
                f.write("====== ordered_chunks LEN ======\n")
                f.write(str(len(ordered_chunks)) + "\n")
            

        # 4. SOSTITUZIONE PLACEHOLDER PROMPT CON knowledge ordinati
        for n, v in kwargs.items():
            # consente uno o più spazi prima/dopo la graffa e dopo
            pattern = r"\s*\{%s\}\s*" % re.escape(n)
            prompt = re.sub(pattern, "\n" + str(v).replace("\\", " ") + "\n", prompt)

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