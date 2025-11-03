#!/bin/bash
# Script di rollback per ripristinare i prompt originali

echo "════════════════════════════════════════════════════════════════"
echo "  ROLLBACK PROMPT - Ripristino stato originale"
echo "════════════════════════════════════════════════════════════════"
echo ""

docker exec ragflow-mysql mysql -uroot -pinfini_rag_flow -D rag_flow << 'SQLROLLBACK'
UPDATE user_canvas dest
INNER JOIN user_canvas_backup_20251103_prompt_optimization backup
ON dest.id = backup.id
SET dest.dsl = backup.dsl
WHERE dest.id = 'a92b7464193811f09d527ebdee58e854';

SELECT '✅ Rollback completato!' as Result;
SQLROLLBACK

echo ""
echo "✅ Prompt ripristinati allo stato originale"
echo ""

