import subprocess

script = """
cd ~/workspace/ragflow

# Backup
cp agent/component/generate.py agent/component/generate.py.bak_openai

# Trova la riga con chat_mdl.chat e aggiungi logging PRIMA
python3 << 'PYEOF'
import re

with open('agent/component/generate.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Trova dove viene chiamato chat_mdl.chat
pattern = r'([ \t]+)(ans = chat_mdl\.chat\(msg\[0\]\["content"\], msg\[1:\], self\._param\.gen_conf\(\)\))'

def add_logging(match):
    indent = match.group(1)
    original = match.group(2)
    
    logging_code = f'''{indent}# ✅ LOGGING DETTAGLIATO CHIAMATA LLM
{indent}logging.info(f"[LLM-INPUT] ========== INIZIO CHIAMATA LLM ==========")
{indent}logging.info(f"[LLM-INPUT] System prompt (primi 300 char): {{msg[0]['content'][:300]}}")
{indent}logging.info(f"[LLM-INPUT] Totale messaggi user/assistant: {{len(msg[1:])}}")
{indent}for idx, m in enumerate(msg[1:]):
{indent}    logging.info(f"[LLM-INPUT] Message {{idx}}: role={{m.get('role', 'unknown')}}, content={{m.get('content', '')[:150]}}...")
{indent}logging.info(f"[LLM-INPUT] ========== FINE INPUT LLM ==========")
{indent}{original}'''
    
    return logging_code

new_content = re.sub(pattern, add_logging, content)

with open('agent/component/generate.py', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("✅ Logging aggiunto a generate.py")
PYEOF

# Riavvia
cd docker
chmod +x ../docker/entrypoint.sh
docker compose restart ragflow

echo '✅ Logging OpenAI aggiunto e container riavviato!'
"""

result = subprocess.run(
    ["ssh", "-i", r"C:\Users\user\Documents\LLM_14.pem", "ubuntu@13.49.16.179", "bash", "-c", script],
    capture_output=True,
    text=True,
    encoding='utf-8',
    errors='ignore'
)

print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr)

