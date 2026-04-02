import type { Tables } from '@/types/database';

type ProcessingJob = Tables<'processing_jobs'>;

interface UnassignedRecordingCardProps {
  recording: ProcessingJob;
  onViewAnalysis: (data: { jobId: string; filename: string }) => void;
}

export default function UnassignedRecordingCard({
  recording,
  onViewAnalysis,
}: UnassignedRecordingCardProps) {
  // Note: Unassigned recordings are legacy data without meeting_id
  // Display job ID as filename since no meeting metadata exists
  const displayName = `Recording ${recording.id.slice(0, 8)}`;

  return (
    <div className="bg-white p-5 rounded-2xl shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="font-semibold text-gray-900">{displayName}</h4>
          <p className="text-sm text-gray-600 mt-1">
            Uploaded:{' '}
            {new Date(recording.created_at || '').toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        </div>
        <div className="ml-4">
          {recording.status === 'completed' ? (
            <button
              onClick={() =>
                onViewAnalysis({
                  jobId: recording.id,
                  filename: displayName,
                })
              }
              className="px-3 py-1.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
            >
              View Analysis
            </button>
          ) : recording.status === 'processing' ? (
            <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600">
              Processing...
            </span>
          ) : recording.status === 'failed' ? (
            <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-950">
              Processing failed
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600">
              {recording.status}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
