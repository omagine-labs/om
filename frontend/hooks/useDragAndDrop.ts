import { useState, DragEvent } from 'react';
import { validateFile } from '@/lib/upload-constants';
import type { Meeting } from '@/hooks/useMeetingData';

interface UseDragAndDropOptions {
  onDrop: (file: File, meeting: Meeting) => Promise<void>;
}

export function useDragAndDrop({ onDrop }: UseDragAndDropOptions) {
  const [dragOverMeetingId, setDragOverMeetingId] = useState<string | null>(
    null
  );

  const handleDragEnter = (e: DragEvent<HTMLDivElement>, meetingId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverMeetingId(meetingId);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverMeetingId(null);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>, meeting: Meeting) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverMeetingId(null);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const file = files[0];
    const validation = validateFile(file);
    if (!validation.valid) {
      alert(validation.error || 'Invalid file');
      return;
    }

    await onDrop(file, meeting);
  };

  return {
    dragOverMeetingId,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  };
}
