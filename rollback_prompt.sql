-- ════════════════════════════════════════════════════════════════════════════════
-- SCRIPT ROLLBACK - Ripristina prompt originali
-- ════════════════════════════════════════════════════════════════════════════════

-- Ripristina da backup
UPDATE user_canvas dest
INNER JOIN user_canvas_backup_20251103_prompt_optimization backup
ON dest.id = backup.id
SET dest.dsl = backup.dsl
WHERE dest.id = 'a92b7464193811f09d527ebdee58e854';

SELECT '✅ Rollback completato! Prompt ripristinati allo stato originale.' as Result;

-- Verifica
SELECT 
    LENGTH(JSON_EXTRACT(dsl, '$.components."Generate:EvilHoundsCreate".obj.params.prompt')) as evil_prompt_length,
    LENGTH(JSON_EXTRACT(dsl, '$.components."Generate:DullDotsMarry".obj.params.prompt')) as dull_prompt_length
FROM user_canvas 
WHERE id = 'a92b7464193811f09d527ebdee58e854';

