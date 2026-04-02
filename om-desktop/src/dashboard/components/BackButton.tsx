import { useNavigate } from 'react-router-dom';

export default function BackButton() {
  const router = useNavigate();

  return (
    <button
      onClick={() => router.back()}
      className="text-blue-600 hover:text-blue-700 font-medium"
    >
      ← Back
    </button>
  );
}
