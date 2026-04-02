interface SubscriptionBadgeProps {
  status: 'active' | 'trialing' | 'canceled';
  daysLeftInTrial?: number | null;
}

export function SubscriptionBadge({
  status,
  daysLeftInTrial,
}: SubscriptionBadgeProps) {
  if (status === 'trialing' && daysLeftInTrial !== null) {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
        Trial: {daysLeftInTrial} days left
      </span>
    );
  }

  if (status === 'canceled') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
        Canceling at period end
      </span>
    );
  }

  if (status === 'active') {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
        Active
      </span>
    );
  }

  return null;
}
