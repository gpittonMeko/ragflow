#!/usr/bin/env python3

filepath = "/home/ubuntu/workspace/ragflow/agent/component/generate.py"

with open(filepath, "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    new_lines.append(line)
    # Cerca la riga con chat_streamly
    if "for ans in chat_mdl.chat_streamly(prompt, [], self._param.gen_conf()):" in line:
        indent = "        "
        # Inserisci PRIMA del for
        new_lines.insert(-1, f'{indent}logging.info("[LLM-STREAM] === STREAM CALL ===")\n')
        new_lines.insert(-1, f'{indent}logging.info(f"[LLM-STREAM] Prompt len: {{len(prompt)}}")\n')
        new_lines.insert(-1, f'{indent}logging.info(f"[LLM-STREAM] Prompt (300 char): {{prompt[:300]}}")\n')

with open(filepath, "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print("✅ Stream logging aggiunto")

