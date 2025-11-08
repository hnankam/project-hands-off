-- Migration: Mark backend and builtin tools as readonly
-- Description: Prevents deletion of seeded backend and builtin tools through the UI
--              Only MCP tools should be deletable by users

-- Mark backend tools as readonly
UPDATE tools 
SET readonly = true 
WHERE tool_type = 'backend' 
  AND tool_key IN ('create_plan', 'update_plan_step', 'get_weather');

-- Mark builtin tools as readonly  
UPDATE tools 
SET readonly = true 
WHERE tool_type = 'builtin' 
  AND tool_key IN ('builtin_web_search', 'builtin_code_execution', 'builtin_image_generation', 'builtin_memory', 'builtin_url_context');

-- Log the changes
DO $$
DECLARE
  backend_count INT;
  builtin_count INT;
BEGIN
  SELECT COUNT(*) INTO backend_count FROM tools WHERE tool_type = 'backend' AND readonly = true;
  SELECT COUNT(*) INTO builtin_count FROM tools WHERE tool_type = 'builtin' AND readonly = true;
  
  RAISE NOTICE '✅ Marked % backend tools as readonly', backend_count;
  RAISE NOTICE '✅ Marked % builtin tools as readonly', builtin_count;
  RAISE NOTICE 'Only MCP tools are now deletable through the UI';
END $$;

