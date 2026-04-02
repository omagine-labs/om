/**
 * Not Found Page for Analysis Preview
 *
 * Shown when meeting ID doesn't exist or is invalid.
 */

import Link from 'next/link';

export default function AnalysisNotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
        <div className="text-6xl mb-4">🔍</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Meeting Analysis Not Found
        </h1>
        <p className="text-gray-600 mb-6">
          The meeting analysis you&apos;re looking for doesn&apos;t exist or may
          have been removed.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Go to Homepage
        </Link>
      </div>
    </div>
  );
}
