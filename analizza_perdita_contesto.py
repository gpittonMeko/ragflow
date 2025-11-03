#!/usr/bin/env python3
"""
Analizza dove si perde il contesto nella conversazione
"""
import subprocess, json

# Prendi le conversazioni recenti
cmd = ["docker", "exec", "ragflow-mysql", "mysql", "-uroot", "-pinfini_rag_flow", "-D", "rag_flow", "--batch", "--raw", "--skip-column-names", "-e", 'SELECT id, create_date, message FROM api_4_conversation WHERE create_date > "2025-11-03 10:00:00" ORDER BY create_date DESC LIMIT 3;']
result = subprocess.run(cmd, capture_output=True, text=True)

print("="*100)
print("ANALISI PERDITA CONTESTO - Confronto domanda vs risposta")
print("="*100)

for line in result.stdout.strip().split("\n"):
    if not line.strip():
        continue
        
    parts = line.split("\t", 2)
    if len(parts) != 3:
        continue
        
    conv_id, date, msg_json = parts
    print(f"\n{'='*100}")
    print(f"Conversazione: {conv_id} - {date}")
    print(f"{'='*100}")
    
    try:
        msgs = json.loads(msg_json)
        
        # Analizza la sequenza
        for i in range(len(msgs)):
            msg = msgs[i]
            role = msg.get("role", "?")
            content = msg.get("content", "")
            
            print(f"\n[Messaggio {i+1}] {role.upper()}:")
            print(f"  {content[:400]}")
            if len(content) > 400:
                print(f"  ... [+{len(content)-400} chars]")
            
            # ANALISI: Verifica coerenza con messaggi precedenti
            if role == "assistant" and i > 0:
                # Prendi i messaggi precedenti
                prev_user_msgs = [m for m in msgs[:i] if m.get("role") == "user"]
                
                if len(prev_user_msgs) == 1 and "ok grazie" in prev_user_msgs[0].get("content", "").lower():
                    # Caso: solo welcome + "ok grazie"
                    print("\n  ⚠️  ANALISI: User ha solo detto 'ok grazie' dopo welcome")
                    if "stavamo parlando" in content.lower() or "se ricordi" in content.lower():
                        print("  ❌ PROBLEMA: Agent dice 'stavamo parlando' ma NON C'ERA ARGOMENTO!")
                        print("  💡 L'LLM sta INVENTANDO un contesto che non esiste")
                
                elif len(prev_user_msgs) >= 2:
                    last_user_question = prev_user_msgs[-1].get("content", "")
                    print(f"\n  📝 Ultima domanda user: {last_user_question[:100]}")
                    
                    # Verifica se la risposta è vaga
                    if any(phrase in content.lower() for phrase in ["quale argomento", "su cosa", "su quale aspetto"]):
                        if "info" in last_user_question.lower() or "più" in last_user_question.lower():
                            print("  ⚠️  User chiede 'info in più' ma agent chiede 'su cosa?'")
                            print("  ❌ PROBLEMA: Agent non capisce che user si riferisce alla conversazione")
                            
    except Exception as e:
        print(f"Errore: {e}")

print("\n" + "="*100)
print("\nCONCLUSIONE:")
print("-"*100)
print("Il problema sembra essere che l'LLM:")
print("  1. RICEVE la history (confermato dai log)")
print("  2. MA il prompt lo confonde quando non c'è argomento specifico discusso")
print("  3. L'LLM INVENTA contesti ('stavamo parlando...') che non esistono")
print("  4. Quando user dice 'info in più' l'LLM non capisce il riferimento")
print("\nSOLUZIONE: Prompt più preciso che distingua:")
print("  - 'ok grazie' dopo SOLO welcome → 'Prego! Come posso aiutarti?'")
print("  - 'ok grazie' dopo argomento discusso → 'Di nulla! Altre domande su [argomento]?'")
print("="*100)

