-- Add pack_tier column to user_packs table
ALTER TABLE public.user_packs 
ADD COLUMN pack_tier TEXT NOT NULL DEFAULT 'standard' 
CHECK (pack_tier IN ('standard', 'premium'));

-- Update existing packs to be standard tier
UPDATE public.user_packs SET pack_tier = 'standard' WHERE pack_tier IS NULL;

-- Create index for faster queries
CREATE INDEX idx_user_packs_tier ON public.user_packs(user_id, pack_type, pack_tier);




