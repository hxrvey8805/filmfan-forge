-- Create table for AI question usage tracking
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
RETURNS TRIGGER 
LANGUAGE plpgsql
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

