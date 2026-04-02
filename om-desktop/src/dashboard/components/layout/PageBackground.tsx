interface PageBackgroundProps {
  children: React.ReactNode;
  maxWidth?: 'max-w-4xl' | 'max-w-7xl';
  variant?: 'sky' | 'teal';
  /** Skip the default content wrapper - use for custom layouts */
  wrapContent?: boolean;
  /** Additional classes for the outer container */
  className?: string;
}

export function PageBackground({
  children,
  maxWidth = 'max-w-7xl',
  variant = 'sky',
  wrapContent = true,
  className = '',
}: PageBackgroundProps) {
  const bgColor = variant === 'teal' ? 'bg-teal-700' : 'bg-sky-700';
  const circleColor = variant === 'teal' ? 'bg-emerald-400' : 'bg-teal-400';
  const ellipseColor = variant === 'teal' ? 'bg-lime-300' : 'bg-emerald-400';
  const ellipseOpacity = variant === 'teal' ? 'opacity-70' : 'opacity-20';

  return (
    <div
      className={`min-h-screen ${bgColor} relative overflow-hidden ${className}`}
    >
      {/* Noise texture background */}
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: 'url(./noise.svg)',
          backgroundRepeat: 'repeat',
          backgroundSize: '200px 200px',
        }}
      />
      {/* Blurred circle background */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 w-[150vw] max-w-[1200px] h-[1200px] ${circleColor} pointer-events-none opacity-70`}
        style={{ top: '-440px', filter: 'blur(150px)', borderRadius: '50%' }}
      />
      {/* Blurred ellipse overlay */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 w-[200vw] max-w-[2000px] h-[500px] ${ellipseColor} pointer-events-none ${ellipseOpacity}`}
        style={{ top: '-300px', filter: 'blur(200px)', borderRadius: '50%' }}
      />
      {/* Blinds lighting effect */}
      <img
        src="./blinds.svg"
        alt=""
        className="absolute -top-[40px] left-1/2 -translate-x-1/2 -rotate-2 h-[300px] sm:h-[500px] w-auto pointer-events-none opacity-[0.06] mix-blend-plus-lighter blur-[3px] sm:blur-[10px]"
      />
      {wrapContent ? (
        <div
          className={`relative z-10 ${maxWidth} mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 2xl:py-8`}
        >
          {children}
        </div>
      ) : (
        <div className="relative z-10">{children}</div>
      )}
    </div>
  );
}
