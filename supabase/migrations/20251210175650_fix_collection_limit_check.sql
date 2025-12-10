-- Fix collection limit check to ensure it only prevents when collection is actually full
-- The check should allow adding cards up to the limit (5), and only prevent when at or over the limit

CREATE OR REPLACE FUNCTION public.check_collection_limit()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count INTEGER;
  max_limit INTEGER := 5;
BEGIN
  -- Count existing cards of the same type for this user (BEFORE this insert)
  SELECT COUNT(*) INTO current_count
  FROM public.user_collection
  WHERE user_id = NEW.user_id
    AND person_type = NEW.person_type;
  
  -- Logic: We want to allow exactly max_limit cards (5)
  -- - If current_count = 4: 4 >= 5 is false, allow insert (you'll have 5 cards) ✓
  -- - If current_count = 5: 5 >= 5 is true, prevent insert (stay at 5 cards) ✓
  -- - If current_count = 6+: 6 >= 5 is true, prevent insert (shouldn't happen, but safety check) ✓
  IF current_count >= max_limit THEN
    RAISE EXCEPTION 'Collection limit exceeded: You already have % % cards. Maximum allowed is %. Please sell a card first.', 
      current_count, NEW.person_type, max_limit;
  END IF;
  
  RETURN NEW;
END;
$$;

-- The trigger should already exist, but ensure it's using the updated function
-- No need to recreate the trigger if it already exists

