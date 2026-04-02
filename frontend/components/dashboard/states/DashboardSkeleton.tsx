/**
 * DashboardSkeleton Component
 *
 * Loading skeleton displayed while fetching dashboard data.
 * Matches the layout of the actual dashboard with 3 metric cards and progress section.
 */

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" data-testid="dashboard-skeleton">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="h-10 w-72 bg-white/20 rounded animate-pulse" />
          <div className="h-6 w-80 bg-white/10 rounded animate-pulse" />
        </div>
        {/* Navigation buttons skeleton */}
        <div className="flex items-center gap-1">
          <div className="h-9 w-9 bg-white/10 rounded-lg animate-pulse" />
          <div className="h-9 w-9 bg-white/10 rounded-lg animate-pulse" />
        </div>
      </div>

      {/* Metrics Cards Skeleton - 3 cards to match actual layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-2xl shadow-lg p-6">
            {/* Header & Subheader */}
            <div className="flex items-start justify-between mb-2">
              <div className="space-y-1">
                <div className="h-8 w-28 bg-gray-200 rounded animate-pulse" />
                <div className="h-5 w-36 bg-gray-100 rounded animate-pulse" />
              </div>
              <div className="h-7 w-16 bg-gray-100 rounded-full animate-pulse" />
            </div>

            {/* Score Ring area */}
            <div className="flex justify-center pt-8 pb-16">
              <div className="h-[140px] w-[140px] bg-gray-100 rounded-full animate-pulse" />
            </div>

            {/* Metrics */}
            <div className="space-y-3">
              {[1, 2].map((j) => (
                <div key={j} className="bg-gray-50 rounded-xl pt-2.5 pb-4 px-4">
                  <div className="flex items-center justify-between">
                    <div className="h-5 w-20 bg-gray-200 rounded animate-pulse" />
                    <div className="h-7 w-12 bg-gray-200 rounded animate-pulse" />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                    <div className="h-5 w-14 bg-gray-100 rounded-full animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="border-t border-white/20"></div>

      {/* Progress Section Skeleton */}
      <div className="space-y-6">
        <div className="h-8 w-32 bg-white/20 rounded animate-pulse" />

        {/* Chart Skeleton */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="space-y-4">
            {/* Chart tabs */}
            <div className="flex gap-2">
              <div className="h-8 w-20 bg-gray-100 rounded animate-pulse" />
              <div className="h-8 w-24 bg-gray-100 rounded animate-pulse" />
              <div className="h-8 w-20 bg-gray-100 rounded animate-pulse" />
            </div>
            {/* Chart area */}
            <div className="h-64 bg-gray-50 rounded animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
