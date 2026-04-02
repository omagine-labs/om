-- Add function to get random slides efficiently
-- Uses database-side randomization instead of fetching all and shuffling client-side

CREATE OR REPLACE FUNCTION get_random_slides(count int)
RETURNS SETOF slides AS $$
  SELECT * FROM slides ORDER BY random() LIMIT count;
$$ LANGUAGE sql STABLE;
