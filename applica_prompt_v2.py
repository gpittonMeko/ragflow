#!/usr/bin/env python3
"""
Script per applicare i prompt ottimizzati usando JSON_MERGE_PATCH
"""
import subprocess
import json
import sys

def get_dsl():
    """Estrae il DSL dal database"""
    cmd = [
        "docker", "exec", "ragflow-mysql",
        "mysql", "-uroot", "-pinfini_rag_flow",
        "-D", "rag_flow",
        "--batch", "--raw", "--skip-column-names",
        "-e", 'SELECT dsl FROM user_canvas WHERE id="a92b7464193811f09d527ebdee58e854";'
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout.strip())

def update_dsl(dsl):
    """Aggiorna il DSL nel database"""
    # Salva DSL come file
    with open("/tmp/new_dsl.json", "w", encoding="utf-8") as f:
        json.dump(dsl, f, ensure_ascii=False)
    
    # Leggi e prepara per MySQL (escape virgolette)
    dsl_str = json.dumps(dsl, ensure_ascii=False)
    dsl_str = dsl_str.replace("\\", "\\\\").replace("'", "\\'")
    
    # Crea file SQL
    with open("/tmp/update.sql", "w", encoding="utf-8") as f:
        f.write(f"UPDATE user_canvas SET dsl = '{dsl_str}' WHERE id = 'a92b7464193811f09d527ebdee58e854';")
    
    # Esegui
    cmd = ["docker", "exec", "-i", "ragflow-mysql", "mysql", "-uroot", "-pinfini_rag_flow", "-D", "rag_flow"]
    with open("/tmp/update.sql", "r", encoding="utf-8") as f:
        result = subprocess.run(cmd, stdin=f, capture_output=True, text=True)
    
    return result.returncode == 0, result.stderr

print("="*100)
print(" " * 30 + "OTTIMIZZAZIONE PROMPT AGENT SGAI v2")
print("="*100)

# Backup
print("\n[1/4] Backup...")
cmd = ["docker", "exec", "ragflow-mysql", "mysql", "-uroot", "-pinfini_rag_flow", "-D", "rag_flow", "-e",
       "DROP TABLE IF EXISTS user_canvas_backup_20251103; CREATE TABLE user_canvas_backup_20251103 AS SELECT * FROM user_canvas WHERE id='a92b7464193811f09d527ebdee58e854';"]
subprocess.run(cmd, capture_output=True)
print("  ✓ Backup creato")

# Estrai DSL
print("\n[2/4] Estrazione DSL...")
dsl = get_dsl()
print(f"  ✓ DSL estratto ({len(dsl.get('components', {}))} componenti)")

# Aggiorna prompt
print("\n[3/4] Aggiornamento prompt...")

# Prompt 1: EvilHoundsCreate
dsl['components']['Generate:EvilHoundsCreate']['obj']['params']['prompt'] = """Sei SGAI, intelligenza artificiale specializzata in diritto tributario e doganale italiano.

HAI ACCESSO ALLA CONVERSAZIONE PRECEDENTE. Usala per contestualizzare!

ISTRUZIONI:
1. RINGRAZIAMENTI (es. "ok grazie"): Rispondi facendo riferimento all'argomento discusso
2. DOMANDE VAGHE: Dai info generali se conosci, poi chiedi dettagli
3. FUORI AMBITO: Sarcasmo ELEGANTE poi riporta al tributario
4. ASSURDE: Sarcastico ma professionale

✓ USA sempre contesto conversazione
✓ Prova SEMPRE a essere utile
✓ Personalità: esperto, disponibile, ironico quando serve"""

print("  ✓ EvilHoundsCreate aggiornato")

# Prompt 2: DullDotsMarry - aggiungi regole in cima
current = dsl['components']['Generate:DullDotsMarry']['obj']['params']['prompt']
rules = """REGOLE USO DOCUMENTI:
✓ USA SEMPRE documenti trovati, ANCHE SE POCHI
✓ 1 doc: "Basandomi sul documento disponibile..."
✓ CITA SEMPRE con ##N$$
✗ NON dire "non ci sono info" se hai documenti!

DISTINZIONI:
• PENA/REATO/PENALE → D.Lgs 74/2000, reclusione (NON sanzioni amministrative!)
• SANZIONE/MULTA → Sanzioni pecuniarie, interessi
• PROCEDURA → Risposta STEP-BY-STEP

"""
dsl['components']['Generate:DullDotsMarry']['obj']['params']['prompt'] = rules + current
print("  ✓ DullDotsMarry aggiornato")

# Salva
print("\n[4/4] Salvataggio nel database...")
success, error = update_dsl(dsl)

if success:
    print("  ✓ DSL salvato!")
    print("\n" + "="*100)
    print("✅ OTTIMIZZAZIONE COMPLETATA!")
    print("="*100)
    print("\n📋 TEST DA FARE:")
    print("  1. 'ok grazie' → risposta contestuale")
    print("  2. 'gestione separata inps' → usa il documento")  
    print("  3. 'quale pena mancato pagamento' → distingue penale")
    print("  4. 'parlami di calcio' → risposta sarcastica")
    print("\n🔄 Rollback: python3 /tmp/rollback_prompt.py\n")
else:
    print(f"  ✗ Errore: {error}")
    print("\n⚠️  Ripristino backup...")
    cmd = ["docker", "exec", "ragflow-mysql", "mysql", "-uroot", "-pinfini_rag_flow", "-D", "rag_flow", "-e",
           "UPDATE user_canvas dest INNER JOIN user_canvas_backup_20251103 backup ON dest.id=backup.id SET dest.dsl=backup.dsl WHERE dest.id='a92b7464193811f09d527ebdee58e854';"]
    subprocess.run(cmd)
    print("  ✓ Backup ripristinato")
    sys.exit(1)

