-- Admin role permissions setup (idempotent, runs on every startup)
-- Users pre-configured in broadsea-atlasdb: admin/admin, ohdsi/ohdsi

DO $$
DECLARE
    admin_role_id INTEGER;
    perm_id INTEGER;
BEGIN
    SELECT id INTO admin_role_id FROM webapi.sec_role WHERE name = 'admin' AND system_role = true;
    IF admin_role_id IS NULL THEN
        INSERT INTO webapi.sec_role (name, system_role) VALUES ('admin', true) RETURNING id INTO admin_role_id;
    END IF;

    PERFORM setval('webapi.sec_permission_sequence',
        GREATEST((SELECT MAX(id) FROM webapi.sec_permission),
                 (SELECT last_value FROM webapi.sec_permission_sequence)) + 1, false);

    -- Source access and management
    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('source:*:access', 'Access all data sources') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'source:*:access';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('source:*:get', 'View data source details') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'source:*:get';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('source:*:put', 'Update data sources') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'source:*:put';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('source:post', 'Create data sources') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'source:post';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('source:*:delete', 'Delete data sources') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'source:*:delete';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('source:connection:*:get', 'Test data source connection') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'source:connection:*:get';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('source:get', 'List data sources') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'source:get';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('source:sources:get', 'List data sources') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'source:sources:get';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    -- Vocabulary permissions
    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('vocabulary:*:info:get', 'Get vocabulary info') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'vocabulary:*:info:get';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    -- TrexSQL permissions (pathInfo excludes /trexsql prefix)
    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('*:cache:status:get', 'Get cache status') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = '*:cache:status:get';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('*:cache:post', 'Build cache') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = '*:cache:post';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('*:cache:delete', 'Delete cache') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = '*:cache:delete';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('*:cache:count:post', 'Count patients') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = '*:cache:count:post';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('*:cache:job:delete', 'Cancel cache job') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = '*:cache:job:delete';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('cache:jobs:get', 'List cache jobs') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'cache:jobs:get';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    -- Role management permissions
    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('role:get', 'List all roles') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'role:get';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('role:*:get', 'View role details') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'role:*:get';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('role:post', 'Create new role') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'role:post';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('role:*:put', 'Update role') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'role:*:put';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('role:*:delete', 'Delete role') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'role:*:delete';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('role:*:permissions:get', 'View role permissions') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'role:*:permissions:get';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('role:*:permissions:*:put', 'Add permissions to role') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'role:*:permissions:*:put';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('role:*:permissions:*:delete', 'Remove permissions from role') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'role:*:permissions:*:delete';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('role:*:users:get', 'View role users') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'role:*:users:get';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('role:*:users:*:put', 'Add users to role') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'role:*:users:*:put';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('role:*:users:*:delete', 'Remove users from role') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'role:*:users:*:delete';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    -- Permission management
    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('permission:get', 'List all permissions') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'permission:get';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    -- User management permissions (required for /user/me and other user endpoints)
    -- Note: WebAPI generates permissions as path:method (e.g., user:me:get for GET /user/me)
    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('user:get', 'List all users') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'user:get';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('user:me:get', 'Access /user/me endpoint') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'user:me:get';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('user:*:get', 'View user information') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'user:*:get';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('user:*:put', 'Update user information') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'user:*:put';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('user:*:roles:get', 'View user roles') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'user:*:roles:get';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    INSERT INTO webapi.sec_permission (value, description)
    VALUES ('user:*:permissions:get', 'View user permissions') ON CONFLICT (value) DO NOTHING;
    SELECT id INTO perm_id FROM webapi.sec_permission WHERE value = 'user:*:permissions:get';
    INSERT INTO webapi.sec_role_permission (role_id, permission_id) VALUES (admin_role_id, perm_id) ON CONFLICT DO NOTHING;

    -- Assign admin user to admin role.
    -- login is the IdP subject for OIDC-provisioned users (WebAPI stores the
    -- Logto `sub` there and the username in name), so matching login alone
    -- silently assigns nothing on any OIDC deployment -- the SELECT returns no
    -- rows and ON CONFLICT DO NOTHING hides it. The login match still covers
    -- the broadsea-atlasdb users noted above, which are seeded with login 'admin'.
    INSERT INTO webapi.sec_user_role (user_id, role_id)
    SELECT u.id, admin_role_id FROM webapi.sec_user u
     WHERE u.login = 'admin' OR u.name = 'admin'
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Admin permissions setup complete for role_id: %', admin_role_id;
END $$;

-- Verify all admin permissions
SELECT p.value, p.description
FROM webapi.sec_role_permission rp
JOIN webapi.sec_role r ON rp.role_id = r.id
JOIN webapi.sec_permission p ON rp.permission_id = p.id
WHERE r.name = 'admin' AND r.system_role = true
ORDER BY p.value;
