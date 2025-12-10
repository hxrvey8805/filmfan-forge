-- Enforce collection limit of 5 cards per type (actor/director) at database level
-- This is a safety net to prevent exceeding the limit even if application-level checks fail

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
  -- Count existing cards of the same type for this user
  SELECT COUNT(*) INTO current_count
  FROM public.user_collection
  WHERE user_id = NEW.user_id
    AND person_type = NEW.person_type;
  
  -- If already at or above limit, prevent insert
  -- current_count is the count BEFORE this insert
  -- We want to allow exactly max_limit cards (5), so we prevent if current_count >= max_limit
  -- This means: if you have 4 cards, you can add a 5th (4 >= 5 is false, allow)
  --            if you have 5 cards, you cannot add a 6th (5 >= 5 is true, prevent)
  IF current_count >= max_limit THEN
    RAISE EXCEPTION 'Collection limit exceeded: You already have % % cards. Maximum allowed is %. Please sell a card first.', 
      current_count, NEW.person_type, max_limit;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger that runs BEFORE INSERT
CREATE TRIGGER enforce_collection_limit_trigger
BEFORE INSERT ON public.user_collection
FOR EACH ROW
EXECUTE FUNCTION public.check_collection_limit();

-- Add comment for documentation
COMMENT ON FUNCTION public.check_collection_limit() IS 'Enforces a maximum of 5 cards per type (actor/director) per user';

