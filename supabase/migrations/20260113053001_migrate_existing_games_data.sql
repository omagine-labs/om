-- Data Migration: Copy existing PowerPoint Karaoke games from meetings to games table
-- This migrates games that were created before the games table consolidation

INSERT INTO public.games (
  id,
  user_id,
  access_token,
  title,
  audio_storage_path,
  video_storage_path,
  recording_size_mb,
  recording_duration_seconds,
  share_clip_path,
  clarity_score,
  confidence_score,
  tips,
  word_count,
  words_per_minute,
  transcript,
  status,
  processing_error,
  created_at,
  updated_at
)
SELECT
  m.id,
  m.user_id,
  gen_random_uuid(), -- Generate new access token for migrated games
  COALESCE(m.title, 'PowerPoint Karaoke'),
  m.audio_storage_path,
  m.video_storage_path,
  m.recording_size_mb,
  m.recording_duration_seconds,
  NULL, -- share_clip_path not tracked in old system
  ga.clarity_score,
  ga.confidence_score,
  ga.tips,
  ga.word_count,
  ga.words_per_minute,
  ga.transcript,
  COALESCE(pj.status, 'completed'), -- Default to completed if no job record
  pj.processing_error,
  m.created_at,
  m.updated_at
FROM public.meetings m
LEFT JOIN public.game_analyses ga ON ga.meeting_id = m.id
LEFT JOIN public.processing_jobs pj ON pj.meeting_id = m.id
WHERE m.meeting_type = 'powerpoint_karaoke'
ON CONFLICT (id) DO NOTHING; -- Skip if already migrated
