import subprocess
import json

cmd = """
docker exec ragflow-mysql mysql -uroot -pinfini_rag_flow rag_flow -e "SELECT JSON_EXTRACT(dsl, '$.messages') as msgs FROM api_4_conversation WHERE id = '7b1724e3-2ccf-4d9e-a88c-03eb6345' LIMIT 1;" -s -N
"""

result = subprocess.run(
    ["ssh", "-i", r"C:\Users\user\Documents\LLM_14.pem", "ubuntu@13.49.16.179", cmd],
    capture_output=True,
    text=True
)

if result.returncode == 0:
    try:
        msgs = json.loads(result.stdout.strip())
        print(f"Totale messaggi: {len(msgs)}")
        for i, msg in enumerate(msgs):
            role = msg.get('role', 'unknown')
            content = msg.get('content', '')[:150]
            print(f"\n[{i}] {role}: {content}...")
    except Exception as e:
        print(f"Error: {e}")
        print(f"Output: {result.stdout}")
else:
    print(f"Error: {result.stderr}")

