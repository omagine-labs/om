-- Seed data for daily_topics table
-- Topics are fun, specific presentation subjects for PowerPoint Karaoke
--
-- NOTE: Slides should be uploaded via the upload-slides.sh script, not seeded here.
-- See docs/database.md for slide upload instructions.

INSERT INTO public.daily_topics (topic_date, topic_name) VALUES
  -- Past days (for testing history/replay)
  (CURRENT_DATE - INTERVAL '7 days', 'The Secret Life of Office Plants'),
  (CURRENT_DATE - INTERVAL '6 days', 'Underwater Basket Weaving Championships'),
  (CURRENT_DATE - INTERVAL '5 days', 'Why Pigeons Should Run the Government'),
  (CURRENT_DATE - INTERVAL '4 days', 'The Economics of Imaginary Friends'),
  (CURRENT_DATE - INTERVAL '3 days', 'Competitive Napping Strategies'),
  (CURRENT_DATE - INTERVAL '2 days', 'How to Train Your Houseplant'),
  (CURRENT_DATE - INTERVAL '1 day', 'The History of Invisible Ink'),
  -- Today and future
  (CURRENT_DATE, 'AI Impact on Urban Farming'),
  (CURRENT_DATE + INTERVAL '1 day', 'The Art of Professional Thumb Wrestling'),
  (CURRENT_DATE + INTERVAL '2 days', 'Quantum Physics for Your Pet'),
  (CURRENT_DATE + INTERVAL '3 days', 'Starting a Business Selling Air'),
  (CURRENT_DATE + INTERVAL '4 days', 'The Psychology of Elevator Music'),
  (CURRENT_DATE + INTERVAL '5 days', 'Extreme Ironing: A Lifestyle'),
  (CURRENT_DATE + INTERVAL '6 days', 'Teaching Robots to Dance'),
  (CURRENT_DATE + INTERVAL '7 days', 'The Future of Cardboard Architecture'),
  (CURRENT_DATE + INTERVAL '8 days', 'Professional Cloud Watching'),
  (CURRENT_DATE + INTERVAL '9 days', 'The Science of Perfect Toast'),
  (CURRENT_DATE + INTERVAL '10 days', 'Underwater Hockey: A Deep Dive'),
  (CURRENT_DATE + INTERVAL '11 days', 'Extreme Couponing in Space'),
  (CURRENT_DATE + INTERVAL '12 days', 'The Philosophy of Waiting in Line'),
  (CURRENT_DATE + INTERVAL '13 days', 'Competitive Rock Paper Scissors'),
  (CURRENT_DATE + INTERVAL '14 days', 'The History of Bubble Wrap')
ON CONFLICT (topic_date) DO NOTHING;
