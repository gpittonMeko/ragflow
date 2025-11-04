import subprocess
import json

cmd = """
docker exec ragflow-mysql mysql -uroot -pinfini_rag_flow rag_flow -e "SELECT JSON_EXTRACT(dsl, '$.components.\\"Generate:EvilHoundsCreate\\".obj.params.prompt') as prompt FROM user_canvas WHERE id = 'a92b7464193811f09d527ebdee58e854';" -s -N
"""

result = subprocess.run(
    ["ssh", "-i", r"C:\Users\user\Documents\LLM_14.pem", "ubuntu@13.49.16.179", cmd],
    capture_output=True,
    text=True
)

if result.returncode == 0:
    prompt = result.stdout.strip().strip('"')
    print("PROMPT ATTUALE DI EvilHoundsCreate:")
    print("="*80)
    print(prompt[:500])
    print("...")
    print(prompt[-500:])
else:
    print(f"Error: {result.stderr}")

