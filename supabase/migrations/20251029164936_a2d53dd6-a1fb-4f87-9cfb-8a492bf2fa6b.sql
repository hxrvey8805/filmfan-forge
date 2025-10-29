-- Create table for user's movie/TV lists
CREATE TABLE public.user_titles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('movie', 'tv')),
  poster_path TEXT NOT NULL,
  year INTEGER,
  progress INTEGER,
  list_type TEXT NOT NULL CHECK (list_type IN ('watchlist', 'watching')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, title_id, list_type)
);

-- Enable Row Level Security
ALTER TABLE public.user_titles ENABLE ROW LEVEL SECURITY;

-- Users can view their own titles
CREATE POLICY "Users can view their own titles" 
ON public.user_titles 
FOR SELECT 
USING (auth.uid() = user_id);

-- Users can insert their own titles
CREATE POLICY "Users can insert their own titles" 
ON public.user_titles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can update their own titles
CREATE POLICY "Users can update their own titles" 
ON public.user_titles 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Users can delete their own titles
CREATE POLICY "Users can delete their own titles" 
ON public.user_titles 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for better performance
CREATE INDEX idx_user_titles_user_id ON public.user_titles(user_id);
CREATE INDEX idx_user_titles_list_type ON public.user_titles(user_id, list_type);