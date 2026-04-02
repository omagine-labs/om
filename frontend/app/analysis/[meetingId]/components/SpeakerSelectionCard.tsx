/**
 * SpeakerSelectionCard Component
 *
 * Displays a speaker with transcript snippets for identification.
 * Used in the speaker selection step before revealing full analysis.
 */

'use client';

interface SpeakerSelectionCardProps {
  speakerLabel: string;
  displayName: string;
  transcriptSnippets: string[];
  isAssigning: boolean;
  onSelect: () => void;
}

export function SpeakerSelectionCard({
  speakerLabel,
  displayName,
  transcriptSnippets,
  isAssigning,
  onSelect,
}: SpeakerSelectionCardProps) {
  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-6 hover:shadow-xl hover:translate-y-[-2px] transition-all">
      <div className="flex items-start justify-between mb-4">
        <h3 className="font-display text-2xl font-semibold tracking-tight text-teal-950">
          {displayName}
        </h3>
        <button
          onClick={onSelect}
          disabled={isAssigning}
          className="px-5 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isAssigning ? 'Assigning...' : 'This is me'}
        </button>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Sample Transcript
        </p>
        {transcriptSnippets.map((snippet, index) => (
          <div
            key={index}
            className="text-base text-slate-700 pl-4 border-l-2 border-teal-300"
          >
            {snippet}
          </div>
        ))}
      </div>
    </div>
  );
}
