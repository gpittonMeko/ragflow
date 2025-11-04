#!/usr/bin/env python3
import subprocess
import json

# Leggi il nuovo prompt
with open('prompt_evilhounds_v3_sarcastico.txt', 'r', encoding='utf-8') as f:
    nuovo_prompt = f.read()

# Prepara il comando SQL
sql_update = f"""
UPDATE user_canvas 
SET dsl = JSON_SET(
    dsl, 
    '$.components."Generate:EvilHoundsCreate".obj.params.prompt',
    '{nuovo_prompt.replace("'", "''").replace(chr(10), '\\n')}'
)
WHERE id = 'a92b7464193811f09d527ebdee58e854';
"""

# Esegui sul server
cmd = f"""
docker exec ragflow-mysql mysql -uroot -pinfini_rag_flow rag_flow << 'SQLEOF'
{sql_update}
SELECT '✅ Prompt aggiornato!' as result;
SQLEOF
"""

result = subprocess.run(
    ['ssh', '-i', r'C:\Users\user\Documents\LLM_14.pem', 'ubuntu@13.49.16.179', cmd],
    capture_output=True,
    text=True,
    encoding='utf-8',
    errors='ignore'
)

print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr)

