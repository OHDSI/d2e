-- Tag groups for cohorts imported from external libraries.
--
-- WebAPI cannot create a root tag through its API (POST /tag requires a parent
-- group), so the groups have to be seeded here. Two of them, because their tags
-- have opposite cardinality: a cohort's source coexists with other tags, while
-- its review status is one-at-a-time. AbstractDaoService.assignTag clears the
-- other tags in a single-selection group, which is what retires the previous
-- status on re-import. Both groups need allow_custom to accept children, and
-- neither is ever assigned to a cohort.
DO $$
DECLARE
    source_group_id integer;
    status_group_id integer;
BEGIN
    -- Group holding the source/provenance tag.
    SELECT id INTO source_group_id FROM webapi.tag
    WHERE lower(name) = lower('Imported Cohort Metadata');

    IF source_group_id IS NULL THEN
        INSERT INTO webapi.tag (name, type, count, show_group, multi_selection,
                                permission_protected, mandatory, allow_custom, description)
        VALUES ('Imported Cohort Metadata', 0, 0, false, true,
                false, false, true,
                'Container for tags recording where an imported cohort came from')
        RETURNING id INTO source_group_id;
        RAISE NOTICE 'Created "Imported Cohort Metadata" tag group (id: %)', source_group_id;
    ELSE
        UPDATE webapi.tag
        SET allow_custom = true, show_group = false, multi_selection = true
        WHERE id = source_group_id
          AND (allow_custom IS NOT TRUE OR show_group IS NOT FALSE
               OR multi_selection IS NOT TRUE);
    END IF;

    -- Group holding the mutually exclusive review-status tags.
    SELECT id INTO status_group_id FROM webapi.tag
    WHERE lower(name) = lower('Cohort Review Status');

    IF status_group_id IS NULL THEN
        INSERT INTO webapi.tag (name, type, count, show_group, multi_selection,
                                permission_protected, mandatory, allow_custom, description)
        VALUES ('Cohort Review Status', 0, 0, false, false,
                false, false, true,
                'Container for the review status of an imported cohort; one applies at a time')
        RETURNING id INTO status_group_id;
        RAISE NOTICE 'Created "Cohort Review Status" tag group (id: %)', status_group_id;
    ELSE
        UPDATE webapi.tag
        SET allow_custom = true, show_group = false, multi_selection = false
        WHERE id = status_group_id
          AND (allow_custom IS NOT TRUE OR show_group IS NOT FALSE
               OR multi_selection IS NOT FALSE);
    END IF;

END $$;

SELECT g.name AS tag_group, g.multi_selection, count(tg.tag_id) AS members
FROM webapi.tag g
LEFT JOIN webapi.tag_group tg ON tg.group_id = g.id
WHERE g.name IN ('Imported Cohort Metadata', 'Cohort Review Status')
GROUP BY g.name, g.multi_selection ORDER BY g.name;
