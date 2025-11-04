#!/usr/bin/env python3
import re

filepath = "/home/ubuntu/workspace/ragflow/agent/component/generate.py"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Trova la riga con chat_mdl.chat
old_line = '        ans = chat_mdl.chat(msg[0]["content"], msg[1:], self._param.gen_conf())'

new_code = '''        logging.info(f"[LLM-CALL] === CHIAMATA OpenAI ===")
        logging.info(f"[LLM-CALL] Totale msg array: {len(msg)}")
        for i, m in enumerate(msg):
            role = m.get('role', 'system' if i == 0 else 'unknown')
            content_preview = str(m.get('content', ''))[:200]
            logging.info(f"[LLM-CALL] msg[{i}] role={role} content={content_preview}")
        ans = chat_mdl.chat(msg[0]["content"], msg[1:], self._param.gen_conf())'''

if old_line in content:
    content = content.replace(old_line, new_code)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print("✅ Logging aggiunto!")
else:
    print("❌ Riga non trovata!")

