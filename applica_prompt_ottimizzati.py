#!/usr/bin/env python3
"""
Script per applicare i prompt ottimizzati all'agent SGAI
"""
import subprocess
import json
import sys

def run_mysql(query):
    """Esegue una query MySQL e ritorna il risultato"""
    cmd = [
        "docker", "exec", "ragflow-mysql",
        "mysql", "-uroot", "-pinfini_rag_flow",
        "-D", "rag_flow",
        "-e", query
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0, result.stdout, result.stderr

print("="*100)
print(" " * 30 + "OTTIMIZZAZIONE PROMPT AGENT SGAI")
print("="*100)

# ════════════════════════════════════════════════════════════════════════════════
# STEP 1: Backup
# ════════════════════════════════════════════════════════════════════════════════
print("\n[1/5] Creazione backup...")
success, stdout, stderr = run_mysql("""
DROP TABLE IF EXISTS user_canvas_backup_20251103_prompt_optimization;
CREATE TABLE user_canvas_backup_20251103_prompt_optimization AS 
SELECT * FROM user_canvas WHERE id = 'a92b7464193811f09d527ebdee58e854';
SELECT 'Backup OK' as Status;
""")

if success:
    print("  ✓ Backup creato: user_canvas_backup_20251103_prompt_optimization")
else:
    print(f"  ✗ Errore backup: {stderr}")
    sys.exit(1)

# ════════════════════════════════════════════════════════════════════════════════
# STEP 2: Estrai DSL attuale
# ════════════════════════════════════════════════════════════════════════════════
print("\n[2/5] Estrazione DSL attuale...")
cmd = [
    "docker", "exec", "ragflow-mysql",
    "mysql", "-uroot", "-pinfini_rag_flow",
    "-D", "rag_flow",
    "--batch", "--raw", "--skip-column-names",
    "-e", 'SELECT dsl FROM user_canvas WHERE id="a92b7464193811f09d527ebdee58e854";'
]
result = subprocess.run(cmd, capture_output=True, text=True)
dsl = json.loads(result.stdout.strip())
print(f"  ✓ DSL estratto ({len(dsl.get('components', {}))} componenti)")

# ════════════════════════════════════════════════════════════════════════════════
# STEP 3: Aggiorna prompt Generate:EvilHoundsCreate
# ════════════════════════════════════════════════════════════════════════════════
print("\n[3/5] Aggiornamento Generate:EvilHoundsCreate...")

new_prompt_evil = """Sei SGAI, un'intelligenza artificiale specializzata in diritto tributario e doganale italiano.

HAI ACCESSO ALLA CONVERSAZIONE PRECEDENTE CON L'UTENTE.
Analizza sempre il contesto della conversazione per rispondere in modo pertinente e contestuale.

ISTRUZIONI COMPORTAMENTALI:

1. RINGRAZIAMENTI (es. "ok grazie", "ciao", "perfetto"):
   → Rispondi cortesemente facendo RIFERIMENTO all'argomento discusso
   → Es: "Di nulla! Se hai altre domande su [argomento], sono a disposizione."

2. DOMANDE TRIBUTARIE VAGHE (es. "parlami di IVA"):
   → Anche senza documenti, prova a dare info generali se conosci l'argomento
   → Chiedi dettagli per approfondire con la knowledge base
   → Es: "L'IVA è l'imposta sul valore aggiunto. Su quale aspetto specifico vuoi approfondire?"

3. DOMANDE FUORI AMBITO MA SENSATE (es. "come va il tempo?"):
   → Risposta sarcastica ma PROFESSIONALE
   → Es: "Sono molto bravo con le aliquote IVA, meno con le previsioni meteo! Parliamo di questioni tributarie?"

4. DOMANDE ASSURDE/PROVOCATORIE:
   → Risposta elegantemente sarcastica mantenendo professionalità
   → Es: "Apprezzo il feedback! Però sono specializzato in diritto tributario. Posso aiutarti con questioni fiscali?"

5. DOMANDE TECNICHE SENZA DOCUMENTI:
   → Prova a rispondere con conoscenze generali
   → Indica che per dettagli serve consultare la knowledge base

REGOLE:
✓ USA SEMPRE il contesto della conversazione precedente
✓ Prova SEMPRE a essere utile anche senza documenti specifici
✓ Personalità SGAI: esperto, disponibile, leggermente sarcastico con domande fuori tema
✓ Se conosci risposta generale: forniscila, poi chiedi dettagli

✗ NON ignorare il contesto conversazione
✗ NON essere offensivo (sarcasmo ELEGANTE)"""

dsl['components']['Generate:EvilHoundsCreate']['obj']['params']['prompt'] = new_prompt_evil

# ════════════════════════════════════════════════════════════════════════════════
# STEP 4: Aggiorna prompt Generate:DullDotsMarry
# ════════════════════════════════════════════════════════════════════════════════
print("\n[4/5] Aggiornamento Generate:DullDotsMarry...")

# Prendi il prompt attuale
current_prompt_dull = dsl['components']['Generate:DullDotsMarry']['obj']['params']['prompt']

# Aggiungi le regole in cima
new_rules = """════════════════════════════════════════════════════════════════
REGOLE FONDAMENTALI USO DOCUMENTI
════════════════════════════════════════════════════════════════

✓ USA SEMPRE i documenti trovati, ANCHE SE POCHI
✓ Con 1 documento: "Basandomi sul documento disponibile..."
✓ Con 2-3 documenti: "Dalle fonti in archivio emerge che..."
✓ CITA SEMPRE le fonti con marker ##N$$ subito dopo ogni citazione
✓ Se info parziali: forniscile COMUNQUE + indica i limiti
✗ NON dire MAI "non ci sono informazioni sufficienti" se hai trovato documenti!

DISTINZIONI CRITICHE:
⚠️ ATTENZIONE - Distingui SEMPRE:

• "PENA"/"REATO"/"PENALE"/"RECLUSIONE" → Conseguenze PENALI
  Cerca: D.Lgs 74/2000, art. 10-bis/10-ter, soglie punibilità, reclusione
  NON confondere con sanzioni amministrative!

• "SANZIONE"/"MULTA"/"INTERESSI" → Conseguenze AMMINISTRATIVE  
  Cerca: sanzioni pecuniarie, ravvedimento, interessi moratori
  Distingui chiaramente da aspetti penali!

• "PROCEDURA"/"COME"/"ITER" → Risposta STEP-BY-STEP numerata

════════════════════════════════════════════════════════════════

"""

new_prompt_dull = new_rules + current_prompt_dull

dsl['components']['Generate:DullDotsMarry']['obj']['params']['prompt'] = new_prompt_dull

# ════════════════════════════════════════════════════════════════════════════════
# STEP 5: Salva DSL aggiornato nel database
# ════════════════════════════════════════════════════════════════════════════════
print("\n[5/5] Salvataggio DSL aggiornato...")

# Salva DSL in file temporaneo
dsl_json = json.dumps(dsl, ensure_ascii=False)

# Scrivi in file per evitare problemi di escape
with open("/tmp/updated_dsl.json", "w", encoding="utf-8") as f:
    f.write(dsl_json)

# Usa LOAD_FILE se disponibile, altrimenti usa Python per fare UPDATE
cmd_update = [
    "docker", "exec", "ragflow-mysql",
    "mysql", "-uroot", "-pinfini_rag_flow",
    "-D", "rag_flow"
]

# Prepara UPDATE statement
update_query = f"""UPDATE user_canvas SET dsl = '{dsl_json}' WHERE id = 'a92b7464193811f09d527ebdee58e854';"""

with open("/tmp/update_dsl.sql", "w", encoding="utf-8") as f:
    f.write(update_query)

# Esegui tramite input redirect
cmd_final = ["docker", "exec", "-i", "ragflow-mysql", "mysql", "-uroot", "-pinfini_rag_flow", "-D", "rag_flow"]
with open("/tmp/update_dsl.sql", "r") as f:
    result = subprocess.run(cmd_final, stdin=f, capture_output=True, text=True)

if result.returncode == 0:
    print("  ✓ DSL aggiornato nel database")
else:
    print(f"  ✗ Errore aggiornamento: {result.stderr}")
    sys.exit(1)

# ════════════════════════════════════════════════════════════════════════════════
# Verifica finale
# ════════════════════════════════════════════════════════════════════════════════
print("\n" + "="*100)
print("Verifica modifiche:")
print("="*100)

success, stdout, stderr = run_mysql("""
SELECT 
    'EvilHoundsCreate' as Component,
    LENGTH(JSON_UNQUOTE(JSON_EXTRACT(dsl, '$.components."Generate:EvilHoundsCreate".obj.params.prompt'))) as new_length
FROM user_canvas WHERE id = 'a92b7464193811f09d527ebdee58e854'
UNION ALL
SELECT 
    'DullDotsMarry' as Component,
    LENGTH(JSON_UNQUOTE(JSON_EXTRACT(dsl, '$.components."Generate:DullDotsMarry".obj.params.prompt'))) as new_length
FROM user_canvas WHERE id = 'a92b7464193811f09d527ebdee58e854';
""")

print(stdout)

print("\n" + "="*100)
print("✅ OTTIMIZZAZIONE COMPLETATA CON SUCCESSO!")
print("="*100)
print("\n📋 PROSSIMI PASSI:")
print("  1. Testa con: 'ok grazie' (deve rispondere contestualmente)")
print("  2. Testa con: 'gestione separata inps' (deve usare il doc trovato)")
print("  3. Testa con: 'quale pena per mancato pagamento tasse' (deve distinguere penale)")
print("  4. Testa con domanda assurda: 'parlami di calcio' (deve rispondere sarcastico)")
print("\n🔄 Per rollback: python3 /tmp/rollback_prompt.py")
print("\n📁 Backup: user_canvas_backup_20251103_prompt_optimization\n")

