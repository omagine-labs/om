-- Add product_type column to subscriptions table
-- This allows us to differentiate between Om and BlindSlide subscriptions
-- Values: 'om' (default for existing subscriptions), 'blindslide'

ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'om';

-- Add check constraint for valid product types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_product_type_check'
  ) THEN
    ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_product_type_check
    CHECK (product_type IN ('om', 'blindslide'));
  END IF;
END $$;

-- Add index for efficient product_type queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_product_type
ON public.subscriptions(product_type);

-- Add composite index for user + product type lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_product_type
ON public.subscriptions(user_id, product_type);

COMMENT ON COLUMN public.subscriptions.product_type IS 'Product type: om for Meeting Intelligence, blindslide for BlindSlide game';
