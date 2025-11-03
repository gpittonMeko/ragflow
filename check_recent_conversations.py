#!/usr/bin/env python3
import subprocess, json

cmd = ["docker", "exec", "ragflow-mysql", "mysql", "-uroot", "-pinfini_rag_flow", "-D", "rag_flow", "--batch", "--raw", "--skip-column-names", "-e", 'SELECT create_date, message FROM api_4_conversation WHERE create_date > "2025-11-03 10:00:00" ORDER BY create_date DESC LIMIT 5;']
result = subprocess.run(cmd, capture_output=True, text=True)

print("="*100)
print("CONVERSAZIONI RECENTI (dopo ottimizzazione prompt)")
print("="*100)

conversations = []
for line in result.stdout.strip().split("\n"):
    if line.strip():
        parts = line.split("\t", 1)
        if len(parts) == 2:
            conversations.append((parts[0], parts[1]))

for idx, (date, msg_json) in enumerate(conversations):
    print(f"\n{'-'*100}")
    print(f"Conversazione #{idx+1} - {date}")
    print(f"{'-'*100}")
    try:
        msgs = json.loads(msg_json)
        for i, m in enumerate(msgs):
            role = m.get("role", "?")
            content = m.get("content", "")
            print(f"\n  [{role.upper()}]:")
            if len(content) > 600:
                print(f"    {content[:600]}...")
                print(f"    [totale: {len(content)} caratteri]")
            else:
                print(f"    {content}")
    except Exception as e:
        print(f"  Errore: {e}")

print("\n" + "="*100)

