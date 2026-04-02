import Link from 'next/link';
import type { Metadata } from 'next';
import BackButton from '@/components/BackButton';

export const metadata: Metadata = {
  title: 'Privacy Policy - Omagine Labs',
  description: 'Privacy Policy for Om by Omagine Labs',
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <BackButton />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Privacy Policy
        </h1>
        <p className="text-gray-600 mb-8">Last Updated: January 19, 2026</p>

        <div className="prose prose-gray max-w-none">
          {/* Introduction */}
          <section className="mb-8">
            <p className="text-gray-700 leading-relaxed">
              Omagine Laboratories, LLC, doing business as Omagine Labs
              (&quot;Omagine Labs&quot;, &quot;we&quot;, &quot;us&quot;, or
              &quot;our&quot;) operates the Om platform available at{' '}
              <a
                href="https://omaginelabs.com"
                className="text-blue-600 hover:text-blue-700"
              >
                omaginelabs.com
              </a>{' '}
              and the BlindSlide game available at{' '}
              <a
                href="https://blindsli.de"
                className="text-blue-600 hover:text-blue-700"
              >
                blindsli.de
              </a>{' '}
              (collectively, the &quot;Service&quot;). This Privacy Policy
              explains how we collect, use, disclose, and safeguard your
              information when you use our Service.
            </p>
            <p className="text-gray-700 leading-relaxed mt-4">
              By using the Service, you agree to the collection and use of
              information in accordance with this policy. If you do not agree
              with the terms of this Privacy Policy, please do not access the
              Service.
            </p>
          </section>

          {/* Information We Collect */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              1. Information We Collect
            </h2>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              1.1 Information You Provide
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              We collect information that you voluntarily provide when using our
              Service:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                <strong>Account Information:</strong> Email address, full name,
                and profile information when you create an account
              </li>
              <li>
                <strong>Meeting Recordings:</strong> Video and audio files that
                you upload to the Service for transcription and analysis
              </li>
              <li>
                <strong>BlindSlide Game Audio:</strong> Audio recordings
                captured during gameplay sessions for transcription and scoring
                analysis
              </li>
              <li>
                <strong>Google Calendar Data:</strong> Calendar events and
                meeting details when you connect your Google Calendar (requires
                your explicit consent via Google OAuth)
              </li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              1.2 Information Automatically Collected
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              When you access the Service, we automatically collect certain
              information:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                <strong>Usage Data:</strong> Information about how you interact
                with the Service, including pages visited, features used, and
                time spent
              </li>
              <li>
                <strong>Device Information:</strong> Browser type, operating
                system, IP address, and device identifiers
              </li>
              <li>
                <strong>Analytics Data:</strong> We use analytics tools to track
                user behavior and improve the user experience
              </li>
              <li>
                <strong>Cookies:</strong> Authentication tokens and session
                cookies necessary for Service functionality
              </li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              1.3 Information from Third-Party Services
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              When you authenticate with Google OAuth, we receive:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>Your Google account email address</li>
              <li>Your Google profile information (name, profile picture)</li>
              <li>
                Access to read your Google Calendar events (only when explicitly
                authorized)
              </li>
            </ul>
          </section>

          {/* How We Use Your Information */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              2. How We Use Your Information
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We use the information we collect for the following purposes:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                <strong>Service Delivery:</strong> To provide, maintain, and
                improve the core functionality of Om, including transcription,
                speaker identification, and AI-powered analysis
              </li>
              <li>
                <strong>Authentication:</strong> To verify your identity and
                manage your account access via Google OAuth
              </li>
              <li>
                <strong>Calendar Integration:</strong> To associate meeting
                recordings with calendar events and provide contextual insights
              </li>
              <li>
                <strong>Processing and Analysis:</strong> To transcribe audio,
                identify speakers, generate meeting summaries, and analyze
                communication patterns
              </li>
              <li>
                <strong>Service Improvement:</strong> To analyze usage patterns
                and user behavior to improve features and user experience
              </li>
              <li>
                <strong>Communication:</strong> To send you service-related
                notifications, updates, and respond to your inquiries
              </li>
              <li>
                <strong>Security:</strong> To protect the Service, detect and
                prevent fraud, and ensure compliance with our Terms of Service
              </li>
            </ul>
          </section>

          {/* Google Calendar Data Usage */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              3. Google Calendar Data Usage
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              When you grant permission to access your Google Calendar, we:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                <strong>Read calendar events</strong> to associate them with
                your uploaded meeting recordings for contextual analysis
              </li>
              <li>
                <strong>Store calendar event data permanently</strong> in our
                database to maintain the association with meeting analyses
              </li>
              <li>
                <strong>Use calendar data exclusively</strong> for providing
                meeting context and insights - we do not use this data for any
                other purpose
              </li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              We only request <strong>read-only</strong> access to your calendar
              and cannot modify, create, or delete calendar events. You can
              revoke calendar access at any time through your Google Account
              settings at{' '}
              <a
                href="https://myaccount.google.com/permissions"
                className="text-blue-600 hover:text-blue-700"
                target="_blank"
                rel="noopener noreferrer"
              >
                myaccount.google.com/permissions
              </a>
              .
            </p>
          </section>

          {/* How We Store and Protect Your Information */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              4. How We Store and Protect Your Information
            </h2>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              4.1 Data Storage
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              Your data is stored using secure cloud infrastructure:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                <strong>Database:</strong> User accounts and analysis data are
                stored in Supabase (PostgreSQL) with row-level security policies
              </li>
              <li>
                <strong>File Storage:</strong> Meeting recordings are stored in
                Supabase Storage with secure access controls
              </li>
              <li>
                <strong>Processing:</strong> Transcription and AI analysis are
                performed using secure cloud services (AssemblyAI, Google Cloud)
              </li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              4.2 Data Retention
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              We retain different types of data for varying periods:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                <strong>Meeting Recordings:</strong> Automatically deleted after
                7 days from upload
              </li>
              <li>
                <strong>Meeting Transcripts and Analyses:</strong> Stored until
                you delete them manually or close your account
              </li>
              <li>
                <strong>Calendar Event Data:</strong> Stored permanently to
                maintain associations with meeting analyses
              </li>
              <li>
                <strong>User Account Data:</strong> Stored until you delete your
                account
              </li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              4.3 Security Measures
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              We implement reasonable security measures to protect your data:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                Industry-standard encryption for data transmission (HTTPS/TLS)
              </li>
              <li>
                Encryption at rest for all stored data, including meeting
                recordings and transcripts
              </li>
              <li>Secure authentication via Google OAuth 2.0</li>
              <li>
                Row-level security policies ensuring users can only access their
                own data
              </li>
              <li>API key authentication for backend service communication</li>
              <li>Regular security updates and monitoring</li>
            </ul>
          </section>

          {/* Data Sharing and Third-Party Services */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              5. Data Sharing and Third-Party Services
            </h2>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              5.1 Service Providers
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              We share your data with trusted third-party service providers who
              help us operate the Service:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                <strong>Supabase:</strong> Database and file storage (PostgreSQL
                and cloud storage)
              </li>
              <li>
                <strong>AssemblyAI:</strong> Audio transcription and speaker
                diarization
              </li>
              <li>
                <strong>Google Cloud Platform:</strong> Backend processing
                infrastructure and AI services
              </li>
              <li>
                <strong>AI Service Providers:</strong> OpenAI, Google Gemini, or
                Anthropic for generating meeting summaries and insights
              </li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              These service providers are contractually obligated to protect
              your data and only use it to provide services to us. They cannot
              use your data for their own purposes.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              5.2 What We Don&apos;t Do
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              We want to be clear about what we DO NOT do with your data:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>We do NOT sell your personal information to third parties</li>
              <li>
                We do NOT use your data for marketing purposes beyond the
                Service
              </li>
              <li>
                We do NOT share your data with advertisers or data brokers
              </li>
              <li>
                We do NOT use your meeting content to train AI models (unless
                explicitly stated in service provider terms)
              </li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              5.3 Legal Requirements
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              We may disclose your information if required by law, such as to:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>Comply with legal obligations or court orders</li>
              <li>
                Protect the rights, property, or safety of Omagine Labs, our
                users, or the public
              </li>
              <li>Investigate potential violations of our Terms of Service</li>
              <li>Prevent fraud or security incidents</li>
            </ul>
          </section>

          {/* Your Rights and Choices */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              6. Your Rights and Choices
            </h2>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              6.1 Access and Control
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              You have the following rights regarding your data:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                <strong>Access:</strong> View all your meeting recordings,
                transcripts, and analyses through the Service dashboard
              </li>
              <li>
                <strong>Delete Recordings:</strong> Immediately delete
                individual recordings and transcripts through the user interface
              </li>
              <li>
                <strong>Account Deletion:</strong> Permanently delete your
                account and all associated data through the user interface
              </li>
              <li>
                <strong>Revoke Calendar Access:</strong> Disconnect Google
                Calendar integration at any time through your Google Account
                settings
              </li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              6.2 Data Portability
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              While we do not currently offer automated data export
              functionality, you may request a copy of your data by contacting
              us at{' '}
              <a
                href="mailto:team@omaginelabs.com"
                className="text-blue-600 hover:text-blue-700"
              >
                team@omaginelabs.com
              </a>
              . We will provide your data in a commonly used format within 30
              days of your request.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              6.3 Marketing Communications
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              We only send service-related communications necessary for the
              operation of the Service. You cannot opt out of these
              communications as they are essential for the Service.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              6.4 Cookies and Tracking
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              We use cookies for authentication and analytics. By using the
              Service, you consent to our use of cookies. You can manage cookie
              preferences through your browser settings, but disabling essential
              cookies may affect Service functionality.
            </p>
          </section>

          {/* Children's Privacy */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              7. Children&apos;s Privacy
            </h2>
            <p className="text-gray-700 leading-relaxed">
              The Service is not intended for use by children under the age of
              13. We do not knowingly collect personal information from children
              under 13. If you are a parent or guardian and believe your child
              has provided us with personal information, please contact us at{' '}
              <a
                href="mailto:team@omaginelabs.com"
                className="text-blue-600 hover:text-blue-700"
              >
                team@omaginelabs.com
              </a>
              , and we will delete the information.
            </p>
          </section>

          {/* International Data Transfers */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              8. International Data Transfers
            </h2>
            <p className="text-gray-700 leading-relaxed">
              Your information may be transferred to and processed in countries
              other than your country of residence, including the United States.
              These countries may have different data protection laws than your
              country. By using the Service, you consent to the transfer of your
              information to the United States and other countries where our
              service providers operate.
            </p>
          </section>

          {/* Changes to This Privacy Policy */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              9. Changes to This Privacy Policy
            </h2>
            <p className="text-gray-700 leading-relaxed">
              We may update this Privacy Policy from time to time to reflect
              changes in our practices or for legal, operational, or regulatory
              reasons. When we make changes, we will update the &quot;Last
              Updated&quot; date at the top of this policy. We encourage you to
              review this Privacy Policy periodically. Your continued use of the
              Service after changes are posted constitutes your acceptance of
              the updated Privacy Policy.
            </p>
          </section>

          {/* Contact Us */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              10. Contact Us
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              If you have questions, concerns, or requests regarding this
              Privacy Policy or our data practices, please contact us:
            </p>
            <div className="bg-gray-100 p-6 rounded-lg">
              <p className="text-gray-700 mb-2">
                <strong>Omagine Laboratories, LLC</strong>
              </p>
              <p className="text-gray-700 mb-2">
                Doing business as: Omagine Labs
              </p>
              <p className="text-gray-700 mb-2">
                131 Continental Dr Suite 305
                <br />
                Newark, DE 19713
              </p>
              <p className="text-gray-700 mb-2">
                Email:{' '}
                <a
                  href="mailto:team@omaginelabs.com"
                  className="text-blue-600 hover:text-blue-700"
                >
                  team@omaginelabs.com
                </a>
              </p>
              <p className="text-gray-700">
                Website:{' '}
                <a
                  href="https://omaginelabs.com"
                  className="text-blue-600 hover:text-blue-700"
                >
                  omaginelabs.com
                </a>
              </p>
            </div>
          </section>

          {/* California Privacy Rights */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              11. California Privacy Rights (CCPA)
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              If you are a California resident, you have specific rights under
              the California Consumer Privacy Act (CCPA):
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                <strong>Right to Know:</strong> You can request information
                about the personal information we collect, use, and disclose
              </li>
              <li>
                <strong>Right to Delete:</strong> You can request deletion of
                your personal information (available through the user interface
                or by contacting us)
              </li>
              <li>
                <strong>Right to Opt-Out:</strong> We do not sell personal
                information, so there is nothing to opt out of
              </li>
              <li>
                <strong>Right to Non-Discrimination:</strong> We will not
                discriminate against you for exercising your privacy rights
              </li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              To exercise these rights, contact us at{' '}
              <a
                href="mailto:team@omaginelabs.com"
                className="text-blue-600 hover:text-blue-700"
              >
                team@omaginelabs.com
              </a>
              .
            </p>
          </section>

          {/* GDPR Rights (European Users) */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              12. European Privacy Rights (GDPR)
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              If you are located in the European Economic Area (EEA), United
              Kingdom, or Switzerland, you have specific rights under the
              General Data Protection Regulation (GDPR):
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                <strong>Right to Access:</strong> Request access to your
                personal data
              </li>
              <li>
                <strong>Right to Rectification:</strong> Request correction of
                inaccurate data
              </li>
              <li>
                <strong>Right to Erasure:</strong> Request deletion of your data
                (available through account deletion)
              </li>
              <li>
                <strong>Right to Restrict Processing:</strong> Request
                restriction of processing in certain circumstances
              </li>
              <li>
                <strong>Right to Data Portability:</strong> Request a copy of
                your data in a portable format
              </li>
              <li>
                <strong>Right to Object:</strong> Object to processing of your
                data
              </li>
              <li>
                <strong>Right to Withdraw Consent:</strong> Withdraw consent at
                any time (e.g., revoke Google Calendar access)
              </li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              To exercise these rights, contact us at{' '}
              <a
                href="mailto:team@omaginelabs.com"
                className="text-blue-600 hover:text-blue-700"
              >
                team@omaginelabs.com
              </a>
              . You also have the right to lodge a complaint with your local
              data protection authority.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-center text-sm text-gray-600">
            <p>
              © {new Date().getFullYear()} Omagine Labs. All rights reserved.
            </p>
            <div className="flex gap-6 mt-4 sm:mt-0">
              <Link href="/privacy" className="hover:text-gray-900">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-gray-900">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
