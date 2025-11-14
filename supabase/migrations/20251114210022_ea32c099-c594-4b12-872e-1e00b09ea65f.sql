-- Expand allowed list_type values to include 'favourite' and 'watched'
ALTER TABLE public.user_titles
  DROP CONSTRAINT IF EXISTS user_titles_list_type_check;

ALTER TABLE public.user_titles
  ADD CONSTRAINT user_titles_list_type_check
  CHECK (list_type = ANY (ARRAY['watchlist'::text, 'watching'::text, 'favourite'::text, 'watched'::text]));