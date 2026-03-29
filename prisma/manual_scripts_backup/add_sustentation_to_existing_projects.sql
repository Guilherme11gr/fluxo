-- Migration: Add Sustentation structure to existing projects
-- Run this AFTER prisma migrate dev has applied the schema changes

-- Step 1: Create Sustentation Epic for projects that don't have one
INSERT INTO epics (org_id, project_id, title, description, status, is_system, created_at, updated_at)
SELECT 
  p.org_id,
  p.id,
  'Sustentação & Backlog Geral',
  'Container para bugs de produção, débitos técnicos e melhorias que não pertencem a features ativas.',
  'OPEN',
  true,
  NOW(),
  NOW()
FROM projects p
WHERE NOT EXISTS (
  SELECT 1 FROM epics e 
  WHERE e.project_id = p.id AND e.is_system = true
);

-- Step 2: Create Sustentation Feature for those new Epics
INSERT INTO features (org_id, epic_id, title, description, status, is_system, created_at, updated_at)
SELECT 
  e.org_id,
  e.id,
  'Bugs de Produção & Melhorias',
  'Tasks órfãs são vinculadas aqui automaticamente.',
  'TODO',
  true,
  NOW(),
  NOW()
FROM epics e
WHERE e.is_system = true
AND NOT EXISTS (
  SELECT 1 FROM features f 
  WHERE f.epic_id = e.id AND f.is_system = true
);

-- Verify the migration
SELECT 
  p.name as project_name,
  e.title as epic_title,
  f.title as feature_title
FROM projects p
JOIN epics e ON e.project_id = p.id AND e.is_system = true
JOIN features f ON f.epic_id = e.id AND f.is_system = true
ORDER BY p.name;
