-- Schools' Organization Owner roles gain the new access-management permissions.
-- (Owner roles hold every school permission; new permissions have to be added to existing roles.)
UPDATE "roles"
SET "permissions" = array_append("permissions", 'iam.users.manage')
WHERE "name" = 'Organization Owner' AND "tenantId" IS NOT NULL AND NOT ('iam.users.manage' = ANY("permissions"));

UPDATE "roles"
SET "permissions" = array_append("permissions", 'iam.roles.manage')
WHERE "name" = 'Organization Owner' AND "tenantId" IS NOT NULL AND NOT ('iam.roles.manage' = ANY("permissions"));
