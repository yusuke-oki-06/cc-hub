-- Enable WebSearch + WebFetch on the default profile.
-- Two steps so each jsonb_set() call is independent and COALESCE can
-- handle the empty-array edge-case when the source list is empty.

-- 1) toggle the boolean flags + add WebSearch/WebFetch to allowedTools
UPDATE profiles
   SET config = jsonb_set(
          jsonb_set(
            jsonb_set(
              config,
              '{allowWebSearch}', 'true'::jsonb
            ),
            '{allowWebFetch}', 'true'::jsonb
          ),
          '{allowedTools}',
          COALESCE(
            (
              SELECT to_jsonb(array_agg(DISTINCT t))
                FROM UNNEST(
                  ARRAY(SELECT jsonb_array_elements_text(config->'allowedTools'))
                  || ARRAY['WebSearch', 'WebFetch']
                ) AS t
            ),
            '[]'::jsonb
          )
        )
 WHERE id = 'default';

-- 2) remove WebSearch/WebFetch from disallowedTools if present
UPDATE profiles
   SET config = jsonb_set(
          config,
          '{disallowedTools}',
          COALESCE(
            (
              SELECT to_jsonb(array_agg(t))
                FROM UNNEST(ARRAY(SELECT jsonb_array_elements_text(config->'disallowedTools'))) AS t
               WHERE t NOT IN ('WebSearch', 'WebFetch')
            ),
            '[]'::jsonb
          )
        )
 WHERE id = 'default';
