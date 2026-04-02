# Icon Components

## How to add your SVG icons:

1. Copy your SVG file content
2. Create a new file like `YourIcon.tsx`
3. Use this template:

```tsx
interface IconProps {
  className?: string;
}

export default function YourIcon({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24" // Update to match your SVG
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Paste your SVG paths here */}
    </svg>
  );
}
```

## Key points:

- Remove fixed `width` and `height` from the SVG tag
- Use `className` prop for styling
- Use `currentColor` for strokes/fills to inherit text color
- Keep the `viewBox` from your original SVG

## Usage:

```tsx
import HomeIcon from '@/components/icons/HomeIcon';

<HomeIcon className="w-6 h-6 text-blue-500" />;
```
