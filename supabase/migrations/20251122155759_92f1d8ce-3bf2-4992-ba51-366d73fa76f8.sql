-- Migration 1: Create table for AI question usage tracking
CREATE TABLE public.user_ai_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  questions_today INTEGER NOT NULL DEFAULT 0,
  last_reset_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_questions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_ai_usage ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own AI usage"
ON public.user_ai_usage
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI usage"
ON public.user_ai_usage
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI usage"
ON public.user_ai_usage
FOR UPDATE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_user_ai_usage_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_user_ai_usage_updated_at
BEFORE UPDATE ON public.user_ai_usage
FOR EACH ROW
EXECUTE FUNCTION public.update_user_ai_usage_updated_at();

-- Create index for better performance
CREATE INDEX idx_user_ai_usage_user_id ON public.user_ai_usage(user_id);
CREATE INDEX idx_user_ai_usage_reset_date ON public.user_ai_usage(last_reset_date);

-- Migration 2: Enforce collection limit of 5 cards per type (actor/director) at database level
CREATE OR REPLACE FUNCTION public.check_collection_limit()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count INTEGER;
  max_limit INTEGER := 5;
BEGIN
  SELECT COUNT(*) INTO current_count
  FROM public.user_collection
  WHERE user_id = NEW.user_id
    AND person_type = NEW.person_type;
  
  -- Prevent insert if we're already at or over the limit
  -- current_count is BEFORE this insert, so:
  -- - If current_count = 4 and max_limit = 5: 4 >= 5 is false, allow insert (you'll have 5 cards) ✓
  -- - If current_count = 5 and max_limit = 5: 5 >= 5 is true, prevent insert (stay at 5 cards) ✓
  IF current_count >= max_limit THEN
    RAISE EXCEPTION 'Collection limit exceeded: You already have % % cards. Maximum allowed is %. Please sell a card first.',
      current_count, NEW.person_type, max_limit;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_collection_limit_trigger
BEFORE INSERT ON public.user_collection
FOR EACH ROW
EXECUTE FUNCTION public.check_collection_limit();