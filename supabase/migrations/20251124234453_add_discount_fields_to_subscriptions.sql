-- Add discount fields to subscriptions table
-- These fields store Stripe coupon/discount information to avoid needing
-- to call the Stripe API for every subscription check

-- Discount percentage (0-100, null if no discount or amount-based discount)
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS discount_percent_off INTEGER;

-- Discount amount in cents (null if no discount or percent-based discount)
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS discount_amount_off INTEGER;

-- Discount duration: 'once', 'repeating', or 'forever'
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS discount_duration TEXT;

-- For 'repeating' duration, how many months the discount lasts
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS discount_duration_months INTEGER;

-- When the discount expires (null for 'forever' duration)
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS discount_end TIMESTAMP WITH TIME ZONE;

-- The Stripe coupon ID for reference
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS stripe_coupon_id TEXT;

-- Add comment explaining the fields
COMMENT ON COLUMN subscriptions.discount_percent_off IS 'Discount percentage (0-100), null if no discount';
COMMENT ON COLUMN subscriptions.discount_amount_off IS 'Discount amount in cents, null if percent-based';
COMMENT ON COLUMN subscriptions.discount_duration IS 'Stripe discount duration: once, repeating, or forever';
COMMENT ON COLUMN subscriptions.discount_duration_months IS 'For repeating discounts, number of months';
COMMENT ON COLUMN subscriptions.discount_end IS 'When the discount expires, null for forever';
COMMENT ON COLUMN subscriptions.stripe_coupon_id IS 'Stripe coupon ID for reference';
