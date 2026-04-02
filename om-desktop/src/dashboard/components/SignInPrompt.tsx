import { getWebAppUrl } from '@/lib/config';

/**
 * Reusable sign-in prompt component for unauthenticated users
 * Opens the web app sign-in page in the system browser
 */
export function SignInPrompt() {
  const handleSignIn = () => {
    const webAppUrl = getWebAppUrl();
    const signInUrl = `${webAppUrl}/login?source=desktop`;
    console.log(
      '[SignInPrompt] Opening sign in URL in default browser:',
      signInUrl
    );
    // Open in default browser instead of new Electron window
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(signInUrl);
    } else {
      // Fallback for web version
      window.open(signInUrl, '_blank');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-10 bg-white rounded-xl shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome to Om
          </h2>
          <p className="text-gray-600 mb-8">
            Sign in to access your meeting insights and analytics
          </p>
          <button
            onClick={handleSignIn}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Sign In
          </button>
          <p className="mt-4 text-sm text-gray-500">
            This will open your browser to complete sign-in
          </p>
        </div>
      </div>
    </div>
  );
}
