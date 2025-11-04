import subprocess

script = """
cd ~/workspace/ragflow
cp agent/component/generate.py agent/component/generate.py.backup_$(date +%s)

# Aggiungi logging dettagliato prima della chiamata LLM
sed -i '/ans = chat_mdl.chat(msg\\[0\\]\\["content"\\], msg\\[1:\\], self._param.gen_conf())/i\\
        logging.info(f"[LLM-CALL] System prompt (primi 500 char): {msg[0][\\"content\\"][:500]}")\\
        logging.info(f"[LLM-CALL] User messages count: {len(msg[1:])}")\\
        for idx, m in enumerate(msg[1:]):\\
            logging.info(f"[LLM-CALL] msg[{idx}] role={m[\\"role\\"]} content={m[\\"content\\"][:200]}...")' agent/component/generate.py

# Riavvia il container
cd docker
docker compose restart ragflow

echo '✅ Logging aggiunto e container riavviato!'
"""

result = subprocess.run(
    ["ssh", "-i", r"C:\Users\user\Documents\LLM_14.pem", "ubuntu@13.49.16.179", "bash", "-c", script],
    capture_output=True,
    text=True
)

print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr)

