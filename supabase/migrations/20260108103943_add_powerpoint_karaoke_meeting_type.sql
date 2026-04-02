-- Add powerpoint_karaoke to meeting_type enum
-- This enables routing game recordings to a separate, simplified analysis pipeline

ALTER TYPE public.meeting_type ADD VALUE IF NOT EXISTS 'powerpoint_karaoke';
