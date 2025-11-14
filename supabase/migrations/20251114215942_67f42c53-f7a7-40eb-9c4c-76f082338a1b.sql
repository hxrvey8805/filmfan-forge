-- Create table to store user's collected actors and directors
CREATE TABLE public.user_collection (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  person_id INTEGER NOT NULL,
  person_name TEXT NOT NULL,
  person_type TEXT NOT NULL, -- 'actor' or 'director'
  profile_path TEXT NOT NULL,
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, person_id)
);

-- Enable RLS
ALTER TABLE public.user_collection ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own collection"
ON public.user_collection
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert into their collection"
ON public.user_collection
FOR INSERT
WITH CHECK (auth.uid() = user_id);