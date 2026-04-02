import type { Metadata } from 'next';
import { DM_Sans, DM_Mono, Fraunces } from 'next/font/google';
import './globals.css';
import { PostHogProvider } from '@/components/PostHogProvider';

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
});

const dmMono = DM_Mono({
  variable: '--font-dm-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Om by Omagine Labs',
  description: 'Transform your meeting recordings into actionable insights',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${dmSans.variable} ${dmMono.variable} ${fraunces.variable} antialiased`}
      >
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
