
INSERT INTO storage.buckets (id, name, public)
VALUES ('inspiration-images', 'inspiration-images', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users view own inspiration images"
ON storage.objects FOR SELECT
USING (bucket_id = 'inspiration-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own inspiration images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'inspiration-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own inspiration images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'inspiration-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own inspiration images"
ON storage.objects FOR DELETE
USING (bucket_id = 'inspiration-images' AND auth.uid()::text = (storage.foldername(name))[1]);
