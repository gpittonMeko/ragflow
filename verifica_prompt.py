#!/usr/bin/env python3
import subprocess, json

cmd = ["docker", "exec", "ragflow-mysql", "mysql", "-uroot", "-pinfini_rag_flow", "-D", "rag_flow", "--batch", "--raw", "--skip-column-names", "-e", 'SELECT dsl FROM user_canvas WHERE id="a92b7464193811f09d527ebdee58e854";']
result = subprocess.run(cmd, capture_output=True, text=True)
dsl = json.loads(result.stdout.strip())

print("\n" + "="*90)
print("VERIFICA PROMPT AGGIORNATI")
print("="*90)

evil = dsl["components"]["Generate:EvilHoundsCreate"]["obj"]["params"]["prompt"]
dull = dsl["components"]["Generate:DullDotsMarry"]["obj"]["params"]["prompt"]

print(f"\n1. Generate:EvilHoundsCreate (senza retrieval):")
print(f"   Lunghezza: {len(evil)} caratteri (prima: ~318)")
print(f"   Inizio: {evil[:150]}")
print(f"   ✓ Contiene 'HAI ACCESSO ALLA CONVERSAZIONE': {('HAI ACCESSO ALLA CONVERSAZIONE' in evil)}")
print(f"   ✓ Contiene istruzioni sarcastiche: {('sarcast' in evil.lower())}")

print(f"\n2. Generate:DullDotsMarry (con retrieval):")
print(f"   Lunghezza: {len(dull)} caratteri (prima: ~979)")
print(f"   Inizio: {dull[:150]}")
print(f"   ✓ Contiene 'REGOLE USO DOCUMENTI': {('REGOLE USO DOCUMENTI' in dull)}")
print(f"   ✓ Contiene 'PENA/REATO/PENALE': {('PENA/REATO/PENALE' in dull)}")
print(f"   ✓ Contiene 'non ci sono informazioni': {('non ci sono info' in dull.lower())}")

print("\n" + "="*90)
if "HAI ACCESSO ALLA CONVERSAZIONE" in evil and "REGOLE USO DOCUMENTI" in dull:
    print("✅ PROMPT AGGIORNATI CORRETTAMENTE!")
    print("\nOra puoi testare l'agent con:")
    print("  1. 'ok grazie' (deve rispondere contestualmente)")
    print("  2. 'gestione separata inps' (deve usare il doc trovato)")
    print("  3. 'quale pena mancato pagamento tasse' (deve distinguere penale)")
    print("  4. 'parlami di calcio' (deve essere sarcastico)")
else:
    print("⚠️  Qualcosa non è stato aggiornato")
print("="*90 + "\n")

