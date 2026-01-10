-- Migration: Clean up orphaned team members
-- Description: Remove team members who are not organization members
-- 
-- This fixes a data integrity issue where users could be added to teams
-- without first being organization members. The application code has been
-- updated to prevent this from happening in the future.

-- First, let's see what will be deleted (for logging/auditing purposes)
-- Run this SELECT first to see affected records:
/*
SELECT 
  tm.id as team_member_id,
  tm."userId",
  tm."teamId",
  t.name as team_name,
  t."organizationId",
  o.name as org_name,
  u.name as user_name,
  u.email as user_email
FROM "teamMember" tm
JOIN team t ON tm."teamId" = t.id
JOIN organization o ON t."organizationId" = o.id
LEFT JOIN "user" u ON tm."userId" = u.id
WHERE NOT EXISTS (
  SELECT 1 FROM member m 
  WHERE m."userId" = tm."userId" 
  AND m."organizationId" = t."organizationId"
);
*/

-- Delete orphaned team members (users in teams but not org members)
DELETE FROM "teamMember"
WHERE id IN (
  SELECT tm.id
  FROM "teamMember" tm
  JOIN team t ON tm."teamId" = t.id
  WHERE NOT EXISTS (
    SELECT 1 FROM member m 
    WHERE m."userId" = tm."userId" 
    AND m."organizationId" = t."organizationId"
  )
);

-- Log how many were deleted
-- (In production, you may want to run the SELECT first to audit before DELETE)

