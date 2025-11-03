#!/usr/bin/env python3
"""
Script di rollback per ripristinare i prompt originali
"""
import subprocess

def run_mysql(query):
    cmd = [
        "docker", "exec", "ragflow-mysql",
        "mysql", "-uroot", "-pinfini_rag_flow",
        "-D", "rag_flow",
        "-e", query
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0, result.stdout, result.stderr

print("="*80)
print(" " * 20 + "ROLLBACK PROMPT ORIGINALI")
print("="*80)

success, stdout, stderr = run_mysql("""
UPDATE user_canvas dest
INNER JOIN user_canvas_backup_20251103_prompt_optimization backup
ON dest.id = backup.id
SET dest.dsl = backup.dsl
WHERE dest.id = 'a92b7464193811f09d527ebdee58e854';
""")

if success:
    print("\n✅ Rollback completato!")
    print("✅ Prompt ripristinati allo stato originale\n")
else:
    print(f"\n✗ Errore rollback: {stderr}\n")

