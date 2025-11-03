#!/usr/bin/env python3
"""
Script per aggiungere logging temporaneo a generate.py
per verificare ESATTAMENTE cosa viene passato all'LLM
"""

import re
from datetime import datetime

# Leggi il file
with open("agent/component/generate.py", "r", encoding="utf-8") as f:
    content = f.read()

# Backup
backup_name = f"agent/component/generate.py.BACKUP_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
with open(backup_name, "w", encoding="utf-8") as f:
    f.write(content)
print(f"✓ Backup creato: {backup_name}")

# Trova e sostituisci la sezione dove si preparano i messaggi per l'LLM
# Cerca la riga 447-454

# Pattern: trova "msg = self._canvas.get_history"
search_pattern = "        msg = self._canvas.get_history(self._param.message_history_window_size)"

if search_pattern not in content:
    print("ERRORE: Pattern non trovato!")
    exit(1)

# Codice logging da inserire PRIMA
logging_before = """        # ============ LOGGING TEMPORANEO - INIZIO ============
        with open("/tmp/generate_messages_to_llm.txt", "a", encoding="utf-8") as debug_f:
            from datetime import datetime
            debug_f.write(f"\\n\\n{'='*100}\\n")
            debug_f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Generate Component: {self._id}\\n")
            debug_f.write(f"{'='*100}\\n")
            debug_f.write(f"message_history_window_size: {self._param.message_history_window_size}\\n")
        # ======================================================
        
        """

# Sostituisci
content = content.replace(
    "        # 7. Prepara messaggi e chiama il modello\n        msg = self._canvas.get_history(self._param.message_history_window_size)",
    "        # 7. Prepara messaggi e chiama il modello\n" + logging_before + "msg = self._canvas.get_history(self._param.message_history_window_size)"
)

# Aggiungi logging DOPO get_history per vedere cosa contiene
pattern_after_get = "        msg = self._canvas.get_history(self._param.message_history_window_size)\n        if len(msg) < 1:"

logging_after_get = """        msg = self._canvas.get_history(self._param.message_history_window_size)
        
        # ============ LOG: Cosa ritorna get_history ============
        with open("/tmp/generate_messages_to_llm.txt", "a", encoding="utf-8") as debug_f:
            debug_f.write(f"\\n[STEP 1] History da canvas.get_history():  {len(msg)} messaggi\\n")
            for i, m in enumerate(msg):
                role = m.get('role', 'N/A')
                content_preview = str(m.get('content', ''))[:150]
                debug_f.write(f"  msg[{i}]: role={role}, content={content_preview}...\\n")
        # =======================================================
        
        if len(msg) < 1:"""

content = content.replace(pattern_after_get, logging_after_get)

# Aggiungi logging DOPO message_fit_in
pattern_after_fit = "        _, msg = message_fit_in([{\"role\": \"system\", \"content\": prompt}, *msg], int(chat_mdl.max_length * 0.97))\n        if len(msg) < 2:"

logging_after_fit = """        _, msg = message_fit_in([{"role": "system", "content": prompt}, *msg], int(chat_mdl.max_length * 0.97))
        
        # ============ LOG: Messaggi dopo message_fit_in ============
        with open("/tmp/generate_messages_to_llm.txt", "a", encoding="utf-8") as debug_f:
            debug_f.write(f"\\n[STEP 2] Messaggi dopo message_fit_in(): {len(msg)} messaggi\\n")
            for i, m in enumerate(msg):
                role = m.get('role', 'N/A')
                content_str = str(m.get('content', ''))
                if role == 'system':
                    debug_f.write(f"  msg[{i}] SYSTEM ({len(content_str)} chars): {content_str[:200]}...\\n")
                else:
                    debug_f.write(f"  msg[{i}] {role}: {content_str[:150]}...\\n")
        # ===========================================================
        
        if len(msg) < 2:"""

content = content.replace(pattern_after_fit, logging_after_fit)

# Aggiungi logging PRIMA della chiamata all'LLM
pattern_before_llm = "        ans = chat_mdl.chat(msg[0][\"content\"], msg[1:], self._param.gen_conf())"

logging_before_llm = """        # ============ LOG: Cosa viene EFFETTIVAMENTE passato all'LLM ============
        with open("/tmp/generate_messages_to_llm.txt", "a", encoding="utf-8") as debug_f:
            debug_f.write(f"\\n[STEP 3] CHIAMATA FINALE ALL'LLM:\\n")
            debug_f.write(f"  System prompt ({len(msg[0]['content'])} chars):\\n")
            debug_f.write(f"    {msg[0]['content'][:400]}\\n")
            debug_f.write(f"  History passata all'LLM ({len(msg[1:])} messaggi):\\n")
            for i, m in enumerate(msg[1:]):
                debug_f.write(f"    [{i}] {m.get('role')}: {str(m.get('content'))[:100]}...\\n")
            debug_f.write(f"\\n  >>> L'LLM VEDE LA HISTORY? {len(msg[1:]) > 0}\\n")
            debug_f.write(f"  >>> L'LLM VEDE 'ok grazie'? {'ok grazie' in str(msg).lower()}\\n")
            debug_f.write(f"{'='*100}\\n\\n")
        # =========================================================================
        
        ans = chat_mdl.chat(msg[0]["content"], msg[1:], self._param.gen_conf())"""

content = content.replace(pattern_before_llm, logging_before_llm)

# Salva il file modificato
with open("agent/component/generate.py", "w", encoding="utf-8") as f:
    f.write(content)

print("✓ Logging temporaneo aggiunto a generate.py")
print("✓ Ora fai rebuild e testa con 'ok grazie'")
print("✓ I log saranno in /tmp/generate_messages_to_llm.txt")

