-- Add INSERT policy for user_packs so users can earn packs
CREATE POLICY "Users can insert their own packs"
ON public.user_packs
FOR INSERT
WITH CHECK (auth.uid() = user_id);