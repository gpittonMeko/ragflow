#!/usr/bin/env python3
"""
Aggiunge logging DETTAGLIATO per verificare cosa va all'LLM
"""

# Leggi generate.py
with open("agent/component/generate.py", "r", encoding="utf-8") as f:
    content = f.read()

# Trova la sezione dove chiama l'LLM (riga ~454)
# ans = chat_mdl.chat(msg[0]["content"], msg[1:], self._param.gen_conf())

# Aggiungi logging PRIMA della chiamata
search_line = "        ans = chat_mdl.chat(msg[0][\"content\"], msg[1:], self._param.gen_conf())"

if search_line in content:
    logging_code = '''        # ============ LOGGING DETTAGLIATO - VERIFICA CHIAMATA LLM ============
        with open("/tmp/llm_call_debug.txt", "a", encoding="utf-8") as llm_f:
            from datetime import datetime
            llm_f.write(f"\\n\\n{'='*100}\\n")
            llm_f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Generate: {self._id}\\n")
            llm_f.write(f"{'='*100}\\n")
            
            # 1. History ricevuta dal canvas
            llm_f.write(f"\\n1. History dal canvas.get_history({self._param.message_history_window_size}):\\n")
            hist_from_canvas = self._canvas.get_history(self._param.message_history_window_size)
            llm_f.write(f"   Lunghezza: {len(hist_from_canvas)}\\n")
            for i, h in enumerate(hist_from_canvas):
                llm_f.write(f"   [{i}] {h}\\n")
            
            # 2. Messaggi preparati per l'LLM (msg array)
            llm_f.write(f"\\n2. Array 'msg' dopo message_fit_in (cosa VA ALL'LLM):\\n")
            llm_f.write(f"   Totale messaggi: {len(msg)}\\n")
            for i, m in enumerate(msg):
                role = m.get('role', '?')
                cont = str(m.get('content', ''))
                if role == 'system':
                    llm_f.write(f"   msg[{i}] SYSTEM ({len(cont)} chars): {cont[:200]}...\\n")
                else:
                    llm_f.write(f"   msg[{i}] {role}: {cont}\\n")
            
            # 3. CHIAMATA EFFETTIVA
            llm_f.write(f"\\n3. CHIAMATA chat_mdl.chat():\\n")
            llm_f.write(f"   Parametro 1 (system): msg[0]['content'] = {len(msg[0]['content'])} chars\\n")
            llm_f.write(f"   Parametro 2 (history): msg[1:] = {len(msg[1:])} messaggi\\n")
            llm_f.write(f"   \\n   HISTORY PASSATA ALL'LLM:\\n")
            for i, h in enumerate(msg[1:]):
                llm_f.write(f"     [{i}] {h.get('role')}: {h.get('content')}\\n")
            
            llm_f.write(f"\\n   >>> L'LLM VEDE 'ok grazie'? {any('ok grazie' in str(m.get('content', '')).lower() for m in msg[1:])}\\n")
            llm_f.write(f"   >>> Numero messaggi nella history passata: {len(msg[1:])}\\n")
            llm_f.write(f"{'='*100}\\n")
        # =====================================================================
        
        ans = chat_mdl.chat(msg[0]["content"], msg[1:], self._param.gen_conf())'''
    
    content = content.replace(search_line, logging_code)
    
    # Salva
    with open("agent/component/generate.py", "w", encoding="utf-8") as f:
        f.write(content)
    
    print("✅ Logging dettagliato aggiunto a generate.py")
    print("✅ Log saranno scritti in: /tmp/llm_call_debug.txt")
    print("✅ Verranno registrati:")
    print("   - History ricevuta dal canvas")
    print("   - Array messaggi dopo message_fit_in")
    print("   - ESATTAMENTE cosa viene passato a OpenAI")
    print("\nProssimo passo: rebuild e test con 'ok grazie'")
else:
    print("❌ ERRORE: Riga di chiamata LLM non trovata!")
    print("Pattern cercato:", search_line)

