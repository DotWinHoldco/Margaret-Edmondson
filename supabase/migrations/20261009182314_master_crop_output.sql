-- An optional explicit finished aspect ratio for an administrator-approved crop.
-- NULL preserves existing crop/border behavior. No artwork is reprocessed here.
ALTER TABLE public.master_artworks ADD COLUMN crop_output jsonb;

ALTER TABLE public.master_artworks
  ADD CONSTRAINT master_artworks_crop_output_valid CHECK (
    crop_output IS NULL OR (
      CASE WHEN jsonb_typeof(crop_output) = 'object'
        AND crop_output ?& ARRAY['version', 'fit', 'width_in', 'height_in']
        AND crop_output - ARRAY['version', 'fit', 'width_in', 'height_in'] = '{}'::jsonb
        AND crop_output->'version' = '1'::jsonb
        AND crop_output->>'fit' IN ('crop', 'pad')
        AND jsonb_typeof(crop_output->'width_in') = 'number'
        AND jsonb_typeof(crop_output->'height_in') = 'number'
      THEN (crop_output->>'width_in')::numeric BETWEEN 1 AND 100
        AND (crop_output->>'height_in')::numeric BETWEEN 1 AND 100
        AND (crop_output->>'width_in')::numeric * 100 = trunc((crop_output->>'width_in')::numeric * 100)
        AND (crop_output->>'height_in')::numeric * 100 = trunc((crop_output->>'height_in')::numeric * 100)
        AND border_mode = 'full_bleed'
        AND lower(border_color) = '#ffffff'
      ELSE false END
    ) IS TRUE
  );

COMMENT ON COLUMN public.master_artworks.crop_output IS
  'Optional version 1 finished size in inches: crop removes pixels; pad adds white. Original source remains immutable. NULL retains legacy crop behavior.';
