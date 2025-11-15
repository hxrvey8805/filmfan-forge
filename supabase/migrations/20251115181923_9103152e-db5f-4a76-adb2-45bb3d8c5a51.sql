-- Add DELETE policy for user_collection so users can delete (sell) their own cards
CREATE POLICY "Users can delete their own collection items"
ON public.user_collection
FOR DELETE
USING (auth.uid() = user_id);