import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/auth-server';
import AppSidebar from '@/components/AppSidebar';
import TopBar from '@/components/TopBar';
import { AuthLayoutClient } from '@/components/AuthLayoutClient';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { SpeakerIdentificationModalProvider } from '@/contexts/SpeakerIdentificationModalContext';
import { MainContent } from '@/components/MainContent';
import { getGlobalUnassignedMeetings } from '@/app/actions/dashboard';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerUser();

  // Redirect to login if not authenticated
  if (!user) {
    redirect('/login');
  }

  // Fetch global unassigned meetings data
  const unassignedData = await getGlobalUnassignedMeetings();

  // For OAuth users, get name from Auth metadata
  // Check multiple metadata fields for compatibility with different OAuth providers
  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.user_metadata?.display_name ||
    user.email ||
    '';

  // For Microsoft OAuth, prefer preferred_username (actual login email)
  // Microsoft sometimes returns an alternate email as the primary email
  const displayEmail =
    user.app_metadata?.provider === 'azure'
      ? user.user_metadata?.preferred_username || user.email || ''
      : user.email || '';

  return (
    <SidebarProvider>
      <SpeakerIdentificationModalProvider currentUserId={user.id}>
        <div className="h-screen overflow-hidden bg-teal-950 noise-overlay">
          <TopBar />
          <AppSidebar
            userName={displayName}
            userEmail={displayEmail}
            unassignedCount={unassignedData.count}
            firstUnassignedMeetingId={unassignedData.firstMeetingId}
          />
          <MainContent>
            <AuthLayoutClient>{children}</AuthLayoutClient>
          </MainContent>
        </div>
      </SpeakerIdentificationModalProvider>
    </SidebarProvider>
  );
}
