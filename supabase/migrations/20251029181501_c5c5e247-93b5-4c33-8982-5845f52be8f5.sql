-- Add tags column to user_titles table
ALTER TABLE public.user_titles 
ADD COLUMN tags text[] DEFAULT '{}';

-- Create index for better tag query performance
CREATE INDEX idx_user_titles_tags ON public.user_titles USING GIN(tags);