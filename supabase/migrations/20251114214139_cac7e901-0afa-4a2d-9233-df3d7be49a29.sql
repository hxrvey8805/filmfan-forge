-- Create table for user packs
CREATE TABLE public.user_packs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pack_type TEXT NOT NULL CHECK (pack_type IN ('actor', 'director')),
  is_opened BOOLEAN NOT NULL DEFAULT false,
  earned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  opened_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.user_packs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own packs"
  ON public.user_packs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own packs"
  ON public.user_packs
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX idx_user_packs_user_id ON public.user_packs(user_id);
CREATE INDEX idx_user_packs_is_opened ON public.user_packs(user_id, is_opened);