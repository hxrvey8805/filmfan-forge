-- Fix search_path for security by recreating with proper settings
DROP TRIGGER IF EXISTS update_user_stats_updated_at ON public.user_stats;
DROP FUNCTION IF EXISTS public.update_user_stats_updated_at();

CREATE OR REPLACE FUNCTION public.update_user_stats_updated_at()
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

CREATE TRIGGER update_user_stats_updated_at
BEFORE UPDATE ON public.user_stats
FOR EACH ROW
EXECUTE FUNCTION public.update_user_stats_updated_at();