/**
 * Metric Tooltip Content Definitions
 *
 * Centralized content for metric tooltips displayed in the Weekly Dashboard.
 * Each tooltip includes:
 * - title: Metric name
 * - definition: What it measures (1-2 sentences)
 * - whyItMatters: Context on importance
 * - healthyRange: Recommended range (optional)
 */

import type { TooltipContent } from '@/components/dashboard/metrics/MetricTooltip';

export const METRIC_TOOLTIPS: Record<string, TooltipContent> = {
  pace: {
    title: 'Pace (Words Per Minute)',
    definition:
      'Measures your speaking speed during meetings, calculated as total words spoken divided by speaking time.',
    whyItMatters:
      "Speaking too fast can make you hard to follow; too slow may lose your audience's attention.",
    healthyRange: '130-160 WPM for professional settings',
  },

  verbosity: {
    title: 'Verbosity',
    definition:
      'Measures the average number of words you use per speaking turn or segment in a conversation.',
    whyItMatters:
      'Higher verbosity may indicate over-explaining or dominating conversations. Lower values suggest more concise, back-and-forth dialogue.',
    healthyRange:
      'Varies by context; shorter responses often indicate better engagement',
  },

  talkTime: {
    title: 'Talk Time',
    definition:
      'The percentage of total meeting time that you spend speaking, relative to other participants.',
    whyItMatters:
      'Balanced talk time shows healthy collaboration. Dominating or minimal participation can affect team dynamics.',
    healthyRange:
      '20-40% in collaborative meetings, varies by role and meeting type',
  },

  interruptionRate: {
    title: 'Interruption Rate',
    definition:
      'The percentage of your speaking turns that were interrupted by others before you finished.',
    whyItMatters:
      'High interruption rates may signal unclear communication, losing engagement, or being cut off. Low rates suggest you hold attention effectively.',
    healthyRange: 'Under 15% in most professional settings',
  },

  interruptionsreceived: {
    title: 'Interruptions Received',
    definition:
      'The average number of times per meeting that others interrupt you while you are speaking.',
    whyItMatters:
      'High interruption counts may signal losing engagement, unclear communication, or power dynamics. Lower counts suggest you hold attention effectively.',
    healthyRange: 'Varies by meeting context; fewer is generally better',
  },

  interruptionsmade: {
    title: 'Interruptions Made',
    definition:
      'The average number of times per meeting that you interrupt others while they are speaking.',
    whyItMatters:
      'Frequent interruptions can signal poor listening or dominance. Lower counts indicate respectful turn-taking and active listening.',
    healthyRange: 'Fewer is better; aim for minimal interruptions',
  },

  fillerWords: {
    title: 'Filler Word Rate',
    definition:
      'The average rate of filler words (like "um", "uh", "like", "you know") per minute of speaking time across your meetings.',
    whyItMatters:
      'Excessive filler words can make you appear less confident or prepared. Tracking your rate over time helps you reduce them and sound more polished and authoritative.',
    healthyRange:
      'Lower is better; aim for fewer than 3-5 filler words per minute',
  },

  turnTakingBalance: {
    title: 'Turn Taking Balance',
    definition:
      'Measures how balanced your participation is in conversations based on speaking turns, duration, and word count relative to other participants. Positive scores indicate dominating, negative scores indicate under-participating, and 0 is perfectly balanced.',
    whyItMatters:
      'Balanced turn-taking fosters healthy collaboration and ensures all voices are heard. This metric helps you identify when you may be speaking too much or too little compared to your typical baseline.',
    healthyRange: '-5 to +5 indicates balanced participation',
  },

  clarity: {
    title: 'Clarity',
    definition:
      'Measures how clear, coherent, and well-structured your communication is based on your speaking patterns.',
    whyItMatters:
      'Clear communication ensures your ideas are understood. Higher clarity scores indicate logical flow, specific examples, and well-organized thoughts.',
    healthyRange: '7-10 indicates strong clarity',
  },

  confidence: {
    title: 'Confidence',
    definition:
      'Evaluates the assertiveness and conviction in your communication style based on tone and language patterns.',
    whyItMatters:
      'Confident communication builds trust and authority. Higher scores suggest direct statements and ownership of ideas.',
    healthyRange: '7-10 indicates strong confidence',
  },

  collaboration: {
    title: 'Collaboration',
    definition:
      "Assesses your ability to build on others' ideas, facilitate discussion, and engage collaboratively in meetings.",
    whyItMatters:
      'Strong collaboration creates productive team dynamics. Higher scores show active engagement, inclusive behavior, and building on contributions.',
    healthyRange: '7-10 indicates excellent collaboration',
  },

  attunement: {
    title: 'Attunement',
    definition:
      'Measures your level of acknowledgement and responsiveness to others during conversations.',
    whyItMatters:
      "Attunement shows active listening and empathy. Higher scores indicate validation of others' points, thoughtful responses, and emotional awareness.",
    healthyRange: '7-10 indicates strong attunement',
  },
};
