import { Link, useNavigate } from 'react-router-dom';

interface AppHeaderProps {
  userName: string;
  userEmail: string;
}

export default function AppHeader({ userName, userEmail }: AppHeaderProps) {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    if (window.electronAPI?.auth?.signOut) {
      await window.electronAPI.auth.signOut();
    }
    navigate('/');
  };

  // Display name if different from email, otherwise just email
  const displayText = userName !== userEmail ? userName : userEmail;

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          <Link to="/dashboard">
            <h1 className="text-2xl font-bold text-gray-900 hover:text-gray-700 transition">
              Om
            </h1>
          </Link>
          <div className="flex gap-4 items-center">
            <span className="text-sm text-gray-600">{displayText}</span>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
