CREATE TABLE public.import_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  signature text NOT NULL,
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_mappings TO authenticated;
GRANT ALL ON public.import_mappings TO service_role;

ALTER TABLE public.import_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import mappings read" ON public.import_mappings
  FOR SELECT TO authenticated
  USING (public.is_active_user());

CREATE POLICY "import mappings write" ON public.import_mappings
  FOR ALL TO authenticated
  USING (public.can('lead.import_export'))
  WITH CHECK (public.can('lead.import_export'));

CREATE INDEX import_mappings_signature_idx ON public.import_mappings (signature);

CREATE TRIGGER import_mappings_touch
  BEFORE UPDATE ON public.import_mappings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();