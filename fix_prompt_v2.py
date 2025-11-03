#!/usr/bin/env python3
"""
Fix v2 del prompt Generate:EvilHoundsCreate
Più preciso per evitare che l'LLM inventi contesti
"""
import subprocess, json

# Estrai DSL
cmd = ["docker", "exec", "ragflow-mysql", "mysql", "-uroot", "-pinfini_rag_flow", "-D", "rag_flow", "--batch", "--raw", "--skip-column-names", "-e", 'SELECT dsl FROM user_canvas WHERE id="a92b7464193811f09d527ebdee58e854";']
result = subprocess.run(cmd, capture_output=True, text=True)
dsl = json.loads(result.stdout.strip())

print("Aggiornamento prompt v2 per evitare invenzione contesti...")

# Nuovo prompt CORRETTO
new_prompt = """Sei SGAI, intelligenza artificiale specializzata in diritto tributario e doganale italiano.

HAI ACCESSO ALLA CONVERSAZIONE PRECEDENTE. Analizzala ATTENTAMENTE.

ANALISI CONTESTO (FAI QUESTO PRIMA DI RISPONDERE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Conta i messaggi nella conversazione
2. Verifica se c'è stato un ARGOMENTO SPECIFICO discusso (oltre al welcome)
3. NON INVENTARE MAI che "stavamo parlando di..." se c'è solo il welcome!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMPORTAMENTO:

CASO A: Solo welcome + ringraziamento (es. "ok grazie" senza domande prima)
→ "Prego! Sono qui per aiutarti con questioni tributarie e doganali. Cosa ti interessa sapere?"
→ NON dire "stavamo parlando" o "se ricordi"!

CASO B: Discusso argomento specifico + ringraziamento
→ "Di nulla! Per altre domande su [argomento effettivamente discusso], sono disponibile."

CASO C: "dammi info" / "di più" SENZA contesto specifico
→ "Su quale tema tributario/doganale vuoi informazioni? IVA, INPS, dogane, accertamenti...?"
→ NON dire "argomento specifico" genericamente!

CASO D: "dammi info" / "di più" CON contesto
→ "Su [argomento discusso], cosa vuoi approfondire? [opzione 1], [opzione 2]...?"

CASO E: Fuori ambito tributario (es. "calcio", "meteo")
→ "Sono bravo con le aliquote IVA, meno con [tema]. Parliamo di tributario?"

CASO F: Provocatorio
→ "Apprezzo il feedback! Sono qui per questioni fiscali. Posso aiutarti?"

REGOLA ORO: 
• Se nella history vedi SOLO messaggi di benvenuto/convenevoli → NON inventare argomenti
• Sii ONESTO sul contesto: se non c'è, ammettilo e offri aiuto generale
• Se c'è un argomento discusso → riferisciti specificamente a quello"""

# Aggiorna
dsl['components']['Generate:EvilHoundsCreate']['obj']['params']['prompt'] = new_prompt

# Salva
dsl_json = json.dumps(dsl, ensure_ascii=False)
dsl_json_escaped = dsl_json.replace("\\", "\\\\").replace("'", "\\'")

with open("/tmp/update_v2.sql", "w", encoding="utf-8") as f:
    f.write(f"UPDATE user_canvas SET dsl = '{dsl_json_escaped}' WHERE id = 'a92b7464193811f09d527ebdee58e854';")

cmd = ["docker", "exec", "-i", "ragflow-mysql", "mysql", "-uroot", "-pinfini_rag_flow", "-D", "rag_flow"]
with open("/tmp/update_v2.sql", "r", encoding="utf-8") as f:
    result = subprocess.run(cmd, stdin=f, capture_output=True, text=True)

if result.returncode == 0:
    print("✅ Prompt v2 aggiornato!")
    print("\nVerifica:")
    
    # Verifica
    cmd2 = ["docker", "exec", "ragflow-mysql", "mysql", "-uroot", "-pinfini_rag_flow", "-D", "rag_flow", "--batch", "--raw", "--skip-column-names", "-e", 'SELECT dsl FROM user_canvas WHERE id="a92b7464193811f09d527ebdee58e854";']
    result2 = subprocess.run(cmd2, capture_output=True, text=True)
    dsl_check = json.loads(result2.stdout.strip())
    
    prompt_check = dsl_check['components']['Generate:EvilHoundsCreate']['obj']['params']['prompt']
    print(f"  Lunghezza nuovo prompt: {len(prompt_check)} caratteri")
    print(f"  Contiene 'NON INVENTARE': {'NON INVENTARE' in prompt_check}")
    print(f"  Contiene 'CASO A': {'CASO A' in prompt_check}")
    print(f"  Prime righe:")
    print(f"  {prompt_check[:200]}")
    print("\n✅ FATTO! Testa ora con 'ok grazie' - NON deve più dire 'stavamo parlando'")
else:
    print(f"❌ Errore: {result.stderr}")

