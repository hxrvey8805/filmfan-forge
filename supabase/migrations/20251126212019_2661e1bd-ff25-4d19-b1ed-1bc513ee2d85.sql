-- Add pack_tier column to user_packs table to support standard and premium packs
ALTER TABLE public.user_packs 
ADD COLUMN pack_tier text NOT NULL DEFAULT 'standard';

-- Add check constraint to ensure only valid pack tiers
ALTER TABLE public.user_packs
ADD CONSTRAINT pack_tier_check CHECK (pack_tier IN ('standard', 'premium'));