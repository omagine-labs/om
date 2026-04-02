import { UserRoundCheck } from 'lucide-react';

/**
 * Desktop Authentication Success Component
 *
 * Displays a success message when desktop app authentication is complete.
 * Shows a teal gradient background with checkmark and instructions.
 * Reused across login, signup, and OAuth callback flows.
 */
export function DesktopAuthSuccess() {
  return (
    <div className="min-h-screen bg-teal-700 relative overflow-hidden flex items-center justify-center px-8">
      {/* Noise texture background */}
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: 'url(/noise.svg)',
          backgroundRepeat: 'repeat',
          backgroundSize: '200px 200px',
        }}
      />

      {/* Blurred emerald circle background */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-[150vw] max-w-[1200px] h-[1200px] bg-emerald-400 pointer-events-none opacity-70"
        style={{ top: '-440px', filter: 'blur(150px)', borderRadius: '50%' }}
      />

      {/* Blurred lime ellipse overlay */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-[200vw] max-w-[2000px] h-[500px] bg-lime-300 pointer-events-none opacity-70"
        style={{ top: '-300px', filter: 'blur(200px)', borderRadius: '50%' }}
      />

      {/* Blinds lighting effect */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/blinds.svg"
        alt=""
        className="absolute -top-[40px] left-1/2 -translate-x-1/2 -rotate-2 h-[300px] sm:h-[500px] w-auto pointer-events-none opacity-[0.06] mix-blend-plus-lighter blur-[3px] sm:blur-[10px]"
      />

      {/* Content */}
      <div
        className="relative z-10 max-w-xl w-full bg-white p-12 text-center"
        style={{
          borderRadius: '1rem',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 bg-teal-600">
          <UserRoundCheck
            className="w-10 h-10 text-white ml-1 mb-1"
            strokeWidth={2}
          />
        </div>
        <h1 className="text-5xl font-semibold font-display text-slate-900 tracking-tighter mb-4">
          Successfully Authenticated!
        </h1>
        <p className="text-gray-600 mb-9 text-xl leading-relaxed">
          You are now signed in to Om Desktop.
        </p>
        <div className="bg-lime-100 px-4 py-4 rounded-lg text-lime-900 text-base font-medium">
          You can close this tab now, and return to the desktop app
        </div>
      </div>
    </div>
  );
}
