CREATE OR REPLACE FUNCTION public.default_fb_opex_growth() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE growth jsonb; inflation jsonb;
BEGIN
  growth := NEW.assumptions #> '{opexGrowth,fb}';
  IF jsonb_typeof(growth) = 'array' THEN
    IF jsonb_array_length(growth) > 0 THEN RETURN NEW; END IF;
  END IF;
  inflation := COALESCE(NULLIF(NEW.assumptions->'costInflation', 'null'::jsonb), '0.025'::jsonb);
  NEW.assumptions := jsonb_set(NEW.assumptions, '{opexGrowth}',
    (CASE WHEN jsonb_typeof(NEW.assumptions->'opexGrowth') = 'object' THEN NEW.assumptions->'opexGrowth' ELSE '{}'::jsonb END)
    || jsonb_build_object('fb', jsonb_build_array(inflation, inflation, inflation)));
  RETURN NEW;
END;
$$;
CREATE TRIGGER default_fb_opex_growth BEFORE INSERT ON public.scenario_assumptions FOR EACH ROW EXECUTE FUNCTION public.default_fb_opex_growth();