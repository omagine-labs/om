/**
 * MeetingsListSkeleton Component
 *
 * Loading skeleton displayed while fetching meetings data.
 * Mimics the actual meeting list layout with date groups and card placeholders.
 */

export function MeetingsListSkeleton() {
  return (
    <div className="space-y-8">
      {/* Skeleton for 2 date groups */}
      {[1, 2].map((groupIndex) => (
        <div key={groupIndex}>
          {/* Date divider skeleton */}
          <div className="mb-3 flex items-center">
            <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
            <div className="flex-grow ml-4 border-t border-slate-200/50" />
          </div>

          {/* 2-3 card skeletons per group */}
          <div className="space-y-3">
            {[1, 2, groupIndex === 1 ? 3 : null].filter(Boolean).map((i) => (
              <div key={i} className="bg-white p-5 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex-1 space-y-2">
                    {/* Title skeleton */}
                    <div className="h-5 w-48 bg-slate-200 rounded animate-pulse" />
                    {/* Time skeleton */}
                    <div className="h-4 w-32 bg-slate-100 rounded animate-pulse" />
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Divider */}
                    <div className="h-6 w-px bg-slate-200" />
                    {/* Delete button skeleton */}
                    <div className="h-10 w-10 bg-slate-100 rounded-lg animate-pulse" />
                    {/* Action button skeleton */}
                    <div className="h-10 w-28 bg-slate-200 rounded-lg animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
