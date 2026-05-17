INSERT INTO storage.buckets (id, name, public)
VALUES ('inspirationsbilleder', 'inspirationsbilleder', false)
ON CONFLICT (id) DO NOTHING;