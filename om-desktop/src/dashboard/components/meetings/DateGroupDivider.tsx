interface DateGroupDividerProps {
  dateLabel: string;
}

export default function DateGroupDivider({ dateLabel }: DateGroupDividerProps) {
  return (
    <div className="relative mb-3">
      <div className="flex items-center">
        <span className="text-sm font-semibold uppercase tracking-wide text-slate-500/90 pr-4">
          {dateLabel}
        </span>
        <div className="flex-grow border-t border-slate-300/30"></div>
      </div>
      {/* Score column labels - positioned to align with MeetingCard score squares */}
      <div
        className="absolute top-px px-4 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-300 bg-slate-50"
        style={{ right: '212px' }}
      >
        <span className="w-9 text-center">CLR</span>
        <span className="w-9 text-center">CNF</span>
        <span className="w-9 text-center">ATT</span>
      </div>
    </div>
  );
}
