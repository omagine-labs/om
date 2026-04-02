import Link from 'next/link';
import type { Metadata } from 'next';
import BackButton from '@/components/BackButton';

export const metadata: Metadata = {
  title: 'Terms of Service - Omagine Labs',
  description: 'Terms of Service for Om by Omagine Labs',
};

export default function TermsOfService() {
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
          Terms of Service
        </h1>
        <p className="text-gray-600 mb-8">Last Updated: January 19, 2026</p>

        <div className="prose prose-gray max-w-none">
          {/* Introduction */}
          <section className="mb-8">
            <p className="text-gray-700 leading-relaxed">
              These Terms of Service (&quot;Terms&quot;) govern your access to
              and use of the Om platform and the BlindSlide game (collectively,
              the &quot;Service&quot;) provided by Omagine Laboratories, LLC,
              doing business as Omagine Labs (&quot;Omagine Labs&quot;,
              &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). The Om
              platform is available at{' '}
              <a
                href="https://omaginelabs.com"
                className="text-blue-600 hover:text-blue-700"
              >
                omaginelabs.com
              </a>{' '}
              and BlindSlide is available at{' '}
              <a
                href="https://blindsli.de"
                className="text-blue-600 hover:text-blue-700"
              >
                blindsli.de
              </a>
              . By accessing or using the Service, you agree to be bound by
              these Terms.
            </p>
            <p className="text-gray-700 leading-relaxed mt-4">
              <strong>
                IF YOU DO NOT AGREE TO THESE TERMS, DO NOT USE THE SERVICE.
              </strong>
            </p>
          </section>

          {/* Acceptance of Terms */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              1. Acceptance of Terms
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              By creating an account, accessing, or using the Service, you
              acknowledge that you have read, understood, and agree to be bound
              by these Terms and our{' '}
              <Link
                href="/privacy"
                className="text-blue-600 hover:text-blue-700"
              >
                Privacy Policy
              </Link>
              , which is incorporated by reference into these Terms.
            </p>
            <p className="text-gray-700 leading-relaxed">
              You must be at least 18 years old to use the Service. By using the
              Service, you represent and warrant that you are at least 18 years
              old and have the legal capacity to enter into these Terms.
            </p>
          </section>

          {/* Account Registration */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              2. Account Registration and Security
            </h2>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              2.1 Account Creation
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              To use the Service, you must create an account using Google OAuth
              authentication. You agree to provide accurate, current, and
              complete information during the registration process and to update
              such information to keep it accurate, current, and complete.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              2.2 Account Security
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              You are responsible for maintaining the confidentiality of your
              account credentials and for all activities that occur under your
              account. You agree to:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                Immediately notify us of any unauthorized access or use of your
                account
              </li>
              <li>
                Ensure that you log out of your account at the end of each
                session
              </li>
              <li>Not share your account credentials with any third party</li>
              <li>Not allow others to access the Service using your account</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              We are not liable for any loss or damage arising from your failure
              to maintain account security.
            </p>
          </section>

          {/* Service Description */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              3. Service Description
            </h2>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              3.1 Om Platform
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              The Om platform provides AI-powered meeting intelligence features,
              including:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>Audio and video transcription with speaker identification</li>
              <li>Meeting summaries and key insights generation</li>
              <li>Communication pattern analysis and behavioral insights</li>
              <li>
                Google Calendar integration for meeting context (optional)
              </li>
              <li>Storage and management of meeting recordings and analyses</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              3.2 BlindSlide Game
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              BlindSlide is a free PowerPoint karaoke game that provides:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                Random presentation slides for improvisational speaking practice
              </li>
              <li>Audio recording during gameplay for transcription</li>
              <li>AI-powered scoring and feedback on presentation skills</li>
              <li>Game history tracking (requires account)</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mb-4">
              BlindSlide is free to use. Account creation is optional but
              required to save game history. Premium subscriptions are available
              for unlimited plays and additional features.
            </p>

            <p className="text-gray-700 leading-relaxed">
              We reserve the right to modify, suspend, or discontinue any part
              of the Service at any time with or without notice. We will not be
              liable to you or any third party for any modification, suspension,
              or discontinuation of the Service.
            </p>
          </section>

          {/* Subscription Plans and Pricing */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              4. Subscription Plans and Pricing
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              This section applies to the Om platform. BlindSlide offers an
              optional premium subscription for unlimited plays and additional
              features.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              4.1 Free Trial
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              We offer a 14-day free trial for new Om users. During the trial
              period, you have full access to the Om features. You may cancel at
              any time during the trial period without being charged. If you do
              not cancel before the trial period ends, your account will
              automatically convert to a paid subscription plan.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              4.2 Subscription Plans
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              After the free trial, the Service is available through the
              following subscription plans:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                <strong>Monthly Plan:</strong> $20 per month, billed monthly
              </li>
              <li>
                <strong>Annual Plan:</strong> $15 per month ($180 per year),
                billed annually
              </li>
              <li>
                <strong>Enterprise Plan:</strong> Starting at $30 per user per
                month, billed annually. Contact us for custom pricing and
                features.
              </li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              All subscription fees are exclusive of applicable taxes, which
              will be added to your invoice where required by law.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              4.3 Payment and Billing
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              By providing payment information, you authorize us to charge the
              applicable subscription fees to your payment method. Subscription
              fees are:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                <strong>Non-refundable:</strong> We do not provide refunds for
                partial months or years of service
              </li>
              <li>
                <strong>Automatically recurring:</strong> Your subscription will
                automatically renew at the end of each billing period unless you
                cancel
              </li>
              <li>
                <strong>Subject to change:</strong> We reserve the right to
                change subscription fees with 30 days&apos; notice to existing
                subscribers
              </li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              4.4 Cancellation
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              You may cancel your subscription at any time through your account
              settings. Cancellation will take effect at the end of your current
              billing period. You will continue to have access to the Service
              until the end of the paid period.
            </p>
          </section>

          {/* Acceptable Use and Recording Consent */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              5. Acceptable Use and Recording Consent
            </h2>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              5.1 Recording Consent Requirement
            </h3>
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
              <p className="text-gray-700 leading-relaxed font-semibold">
                IMPORTANT: You are solely responsible for obtaining all
                necessary consents from meeting participants before recording
                any conversation, as required by applicable federal, state, and
                local laws.
              </p>
            </div>
            <p className="text-gray-700 leading-relaxed mb-4">
              Recording laws vary by jurisdiction. Some jurisdictions require
              all-party consent (all participants must consent to recording),
              while others require only one-party consent (only the person
              making the recording must consent). It is your responsibility to:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                Understand and comply with all applicable recording consent laws
                in your jurisdiction and the jurisdictions of all meeting
                participants
              </li>
              <li>
                Inform all meeting participants that the meeting is being
                recorded before starting the recording
              </li>
              <li>
                Obtain explicit consent from all participants where required by
                law
              </li>
              <li>
                Stop recording immediately if any required consent is not
                obtained or is withdrawn
              </li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              You acknowledge that Omagine Labs is not responsible for your
              compliance with recording consent laws. Failure to comply with
              applicable laws may result in criminal or civil liability, and we
              reserve the right to terminate your account for violations.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              5.2 Prohibited Uses
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              You agree not to use the Service to upload, transmit, or otherwise
              make available any content that:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                Contains sexually explicit content, pornography, or nudity
              </li>
              <li>
                Depicts or promotes violence, threats, harassment, or
                intimidation
              </li>
              <li>
                Infringes any intellectual property rights, privacy rights, or
                other rights of third parties
              </li>
              <li>
                Contains hateful, discriminatory, or defamatory material based
                on race, ethnicity, religion, gender, sexual orientation,
                disability, or other protected characteristics
              </li>
              <li>
                Exploits, harms, or attempts to exploit or harm minors in any
                way
              </li>
              <li>
                Promotes illegal activities or violates any applicable laws or
                regulations
              </li>
              <li>Contains malware, viruses, or other harmful code</li>
              <li>
                Impersonates any person or entity or misrepresents your
                affiliation with a person or entity
              </li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              5.3 Content Moderation
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              While we do not proactively monitor user content, we reserve the
              right to review content if we become aware of potential
              violations. If we determine that content violates these Terms, we
              may:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>Remove or disable access to the violating content</li>
              <li>Suspend or terminate your account without refund</li>
              <li>
                Report illegal content to law enforcement or other authorities
                as required by law
              </li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              5.4 Usage Restrictions
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              You agree not to:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                Attempt to circumvent any security features or access controls
              </li>
              <li>
                Use the Service in a way that could damage, disable, or impair
                the Service or interfere with other users&apos; use
              </li>
              <li>
                Use automated systems (bots, scripts, etc.) to access the
                Service without our prior written permission
              </li>
              <li>
                Reverse engineer, decompile, or disassemble any part of the
                Service
              </li>
              <li>
                Resell, rent, lease, or sublicense access to the Service to
                third parties
              </li>
            </ul>
          </section>

          {/* Intellectual Property */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              6. Intellectual Property Rights
            </h2>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              6.1 Your Content
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              You retain all ownership rights to the content you upload to the
              Service, including meeting recordings, transcripts, and any other
              data you provide (&quot;Your Content&quot;). We do not claim any
              ownership rights to Your Content.
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              By uploading Your Content to the Service, you grant us a limited,
              non-exclusive, royalty-free, worldwide license to:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                Store, process, and transmit Your Content as necessary to
                provide the Service to you
              </li>
              <li>
                Use Your Content in aggregated and anonymized form to improve
                the Service, develop new features, and enhance our AI models and
                algorithms
              </li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              This license terminates when you delete Your Content or close your
              account, except for aggregated and anonymized data that cannot be
              attributed to you.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              6.2 Our Intellectual Property
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              The Service, including all software, text, images, trademarks,
              service marks, logos, and other content provided by us
              (collectively, &quot;Our Content&quot;), is owned by Omagine Labs
              or our licensors and is protected by intellectual property laws.
            </p>
            <p className="text-gray-700 leading-relaxed">
              These Terms do not grant you any right, title, or interest in Our
              Content except for the limited right to use the Service as
              described in these Terms. You may not copy, modify, distribute, or
              create derivative works based on Our Content without our express
              written permission.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              6.3 Feedback
            </h3>
            <p className="text-gray-700 leading-relaxed">
              If you provide us with feedback, suggestions, or ideas about the
              Service (&quot;Feedback&quot;), you grant us a perpetual,
              irrevocable, worldwide, royalty-free license to use, modify, and
              incorporate such Feedback into the Service without any obligation
              or compensation to you.
            </p>
          </section>

          {/* Data Retention and Deletion */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              7. Data Retention and Deletion
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We retain Your Content according to the following schedule:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                <strong>Meeting Recordings:</strong> Automatically deleted after
                7 days from upload
              </li>
              <li>
                <strong>Meeting Transcripts and Analyses:</strong> Retained
                until you manually delete them or close your account
              </li>
              <li>
                <strong>Account Data:</strong> Retained until you close your
                account
              </li>
            </ul>
            <p className="text-gray-700 leading-relaxed mb-4">
              You may delete individual recordings and analyses at any time
              through the Service dashboard. When you close your account, we
              will delete all Your Content within 30 days, except:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                Data we are required to retain by law or for legitimate business
                purposes (e.g., billing records)
              </li>
              <li>
                Aggregated and anonymized data that cannot be attributed to you
              </li>
              <li>
                Backup copies, which will be deleted in the normal course of
                backup rotation (typically within 90 days)
              </li>
            </ul>
          </section>

          {/* Disclaimers and Warranties */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              8. Disclaimers and Warranties
            </h2>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              8.1 Service Provided &quot;As-Is&quot;
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4 uppercase font-semibold">
              THE SERVICE IS PROVIDED &quot;AS-IS&quot; AND &quot;AS
              AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR
              IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
              NON-INFRINGEMENT.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              8.2 No Guarantee of Accuracy
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              We do not guarantee the accuracy, completeness, or reliability of:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                Transcriptions generated by the Service (accuracy may vary based
                on audio quality, accents, background noise, and other factors)
              </li>
              <li>
                AI-generated summaries, insights, or analyses (these are
                algorithmic interpretations and may contain errors or omissions)
              </li>
              <li>
                Speaker identification and diarization (may misattribute speech
                or fail to distinguish speakers)
              </li>
              <li>
                Communication metrics and behavioral insights (these are
                analytical tools, not definitive assessments)
              </li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              8.3 Professional Advice Disclaimer
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              The Service provides analytical tools and insights for
              informational purposes only. The Service does not provide:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                Professional advice (legal, financial, medical, psychological,
                or HR consulting)
              </li>
              <li>Employment decisions or recommendations</li>
              <li>
                Definitive assessments of individual performance or capabilities
              </li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              You should not rely solely on the Service&apos;s outputs to make
              important business, personnel, or other decisions. Always exercise
              your own judgment and consult qualified professionals when
              appropriate.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              8.4 No Guarantee of Availability
            </h3>
            <p className="text-gray-700 leading-relaxed">
              We do not guarantee that the Service will be available at all
              times or that it will be uninterrupted, timely, secure, or
              error-free. We may experience downtime due to maintenance,
              updates, technical issues, or circumstances beyond our control.
            </p>
          </section>

          {/* Limitation of Liability */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              9. Limitation of Liability
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4 uppercase font-semibold">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, OMAGINE LABS, ITS
              OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, AND LICENSORS WILL NOT BE
              LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
              PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR USE,
              ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICE, WHETHER
              BASED ON WARRANTY, CONTRACT, TORT (INCLUDING NEGLIGENCE), OR ANY
              OTHER LEGAL THEORY, EVEN IF WE HAVE BEEN ADVISED OF THE
              POSSIBILITY OF SUCH DAMAGES.
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              Our total liability to you for all claims arising out of or
              related to these Terms or the Service, whether in contract, tort,
              or otherwise, will not exceed the amounts paid by you to us in the
              12 months preceding the claim, or $100, whichever is greater.
            </p>
            <p className="text-gray-700 leading-relaxed">
              Some jurisdictions do not allow the exclusion or limitation of
              certain damages. In such jurisdictions, our liability will be
              limited to the maximum extent permitted by law.
            </p>
          </section>

          {/* Indemnification */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              10. Indemnification
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              You agree to indemnify, defend, and hold harmless Omagine Labs,
              its officers, directors, employees, agents, licensors, and service
              providers from and against any claims, liabilities, damages,
              losses, costs, and expenses (including reasonable attorneys&apos;
              fees) arising out of or related to:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>Your use of the Service</li>
              <li>Your violation of these Terms</li>
              <li>
                Your violation of any rights of third parties, including other
                users
              </li>
              <li>
                Your failure to obtain required recording consent from meeting
                participants
              </li>
              <li>
                Your Content, including any claims that Your Content infringes
                or violates any intellectual property rights, privacy rights, or
                other rights of third parties
              </li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              We reserve the right to assume the exclusive defense and control
              of any matter subject to indemnification by you, and you agree to
              cooperate with our defense of such claims.
            </p>
          </section>

          {/* Termination */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              11. Termination
            </h2>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              11.1 Termination by You
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              You may close your account at any time through your account
              settings. Upon account closure:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                Your subscription will be canceled, but you will not receive a
                refund for the current billing period
              </li>
              <li>
                You will lose access to the Service at the end of your current
                billing period
              </li>
              <li>
                Your Content will be deleted according to our data retention
                policy (within 30 days)
              </li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              11.2 Termination by Us
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              We reserve the right to suspend or terminate your account and
              access to the Service immediately, without prior notice or
              liability, for any reason, including:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>Violation of these Terms</li>
              <li>
                Uploading prohibited content (including explicit or
                inappropriate material)
              </li>
              <li>Failure to obtain required recording consent</li>
              <li>Fraudulent or illegal activity</li>
              <li>
                Behavior that harms or may harm other users or the Service
              </li>
              <li>Non-payment of subscription fees</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mb-4">
              If we terminate your account for violation of these Terms, you
              will not be entitled to any refund of subscription fees.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              11.3 Effect of Termination
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              Upon termination of your account for any reason:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                Your right to access and use the Service will immediately cease
              </li>
              <li>
                We will delete Your Content according to our data retention
                policy
              </li>
              <li>
                Sections of these Terms that by their nature should survive
                termination will survive, including intellectual property
                rights, disclaimers, limitations of liability, indemnification,
                and dispute resolution provisions
              </li>
            </ul>
          </section>

          {/* Dispute Resolution */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              12. Dispute Resolution and Arbitration
            </h2>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              12.1 Informal Resolution
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              Before filing a formal claim, you agree to contact us at{' '}
              <a
                href="mailto:team@omaginelabs.com"
                className="text-blue-600 hover:text-blue-700"
              >
                team@omaginelabs.com
              </a>{' '}
              and attempt to resolve the dispute informally. We will attempt to
              resolve the dispute through good-faith negotiations within 60 days
              of receiving your notice.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              12.2 Binding Arbitration
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              If we cannot resolve a dispute informally, you agree that any
              dispute, claim, or controversy arising out of or relating to these
              Terms or the Service (collectively, &quot;Disputes&quot;) will be
              resolved by binding arbitration administered by the American
              Arbitration Association (&quot;AAA&quot;) under its Commercial
              Arbitration Rules, rather than in court.
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              The arbitration will be:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                Conducted by a single neutral arbitrator selected in accordance
                with AAA rules
              </li>
              <li>
                Held in Park City, Utah, or another mutually agreed location, or
                conducted remotely by videoconference
              </li>
              <li>
                Governed by the Federal Arbitration Act and federal arbitration
                law
              </li>
              <li>
                Subject to limited discovery as determined by the arbitrator
              </li>
            </ul>
            <p className="text-gray-700 leading-relaxed mb-4">
              The arbitrator&apos;s decision will be final and binding, and
              judgment on the award may be entered in any court of competent
              jurisdiction.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              12.3 Exceptions to Arbitration
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              Either party may bring claims in small claims court if the claims
              qualify and remain in small claims court. Additionally, either
              party may seek injunctive or equitable relief in court to protect
              intellectual property rights.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              12.4 Class Action Waiver
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4 uppercase font-semibold">
              YOU AND OMAGINE LABS AGREE THAT DISPUTES WILL BE RESOLVED ON AN
              INDIVIDUAL BASIS ONLY, AND NOT AS A CLASS ACTION, CONSOLIDATED
              ACTION, OR REPRESENTATIVE ACTION. YOU AND OMAGINE LABS WAIVE THE
              RIGHT TO PARTICIPATE IN A CLASS ACTION, PRIVATE ATTORNEY GENERAL
              ACTION, OR OTHER REPRESENTATIVE PROCEEDING.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              12.5 Arbitration Costs
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              Each party will be responsible for its own attorneys&apos; fees
              and costs unless the arbitrator determines otherwise. If you
              initiate arbitration and the arbitrator finds your claim
              frivolous, you may be required to reimburse us for our arbitration
              costs.
            </p>
          </section>

          {/* Governing Law */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              13. Governing Law and Jurisdiction
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              These Terms and any disputes arising out of or related to these
              Terms or the Service will be governed by and construed in
              accordance with the laws of the State of Utah, without regard to
              its conflict of law principles.
            </p>
            <p className="text-gray-700 leading-relaxed">
              For any disputes not subject to arbitration, you agree to submit
              to the exclusive jurisdiction of the state and federal courts
              located in Summit County, Utah.
            </p>
          </section>

          {/* Changes to Terms */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              14. Changes to These Terms
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We reserve the right to modify these Terms at any time. When we
              make material changes, we will:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>
                Update the &quot;Last Updated&quot; date at the top of these
                Terms
              </li>
              <li>
                Notify you by email or through a prominent notice on the Service
              </li>
              <li>
                Provide you with at least 30 days&apos; notice before the
                changes take effect
              </li>
            </ul>
            <p className="text-gray-700 leading-relaxed mb-4">
              Your continued use of the Service after the effective date of the
              updated Terms constitutes your acceptance of the changes. If you
              do not agree to the updated Terms, you must stop using the Service
              and close your account.
            </p>
          </section>

          {/* General Provisions */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              15. General Provisions
            </h2>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              15.1 Entire Agreement
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              These Terms, together with our Privacy Policy, constitute the
              entire agreement between you and Omagine Labs regarding the
              Service and supersede all prior agreements and understandings.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              15.2 Severability
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              If any provision of these Terms is found to be invalid or
              unenforceable, that provision will be limited or eliminated to the
              minimum extent necessary, and the remaining provisions will remain
              in full force and effect.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              15.3 Waiver
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              Our failure to enforce any right or provision of these Terms will
              not constitute a waiver of such right or provision. Any waiver of
              any provision of these Terms will be effective only if in writing
              and signed by an authorized representative of Omagine Labs.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              15.4 Assignment
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              You may not assign or transfer these Terms or your rights and
              obligations under these Terms without our prior written consent.
              We may assign these Terms without restriction, including in
              connection with a merger, acquisition, reorganization, or sale of
              assets.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              15.5 No Third-Party Beneficiaries
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              These Terms do not create any third-party beneficiary rights
              except as expressly stated herein.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              15.6 Force Majeure
            </h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              We will not be liable for any delay or failure to perform our
              obligations under these Terms due to circumstances beyond our
              reasonable control, including acts of God, war, terrorism, natural
              disasters, labor disputes, or interruptions in third-party
              services.
            </p>
          </section>

          {/* Contact Information */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              16. Contact Us
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              If you have questions about these Terms, please contact us:
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

          {/* Acknowledgment */}
          <section className="mb-8">
            <div className="bg-blue-50 border-l-4 border-blue-400 p-6">
              <p className="text-gray-700 leading-relaxed font-semibold mb-2">
                Acknowledgment
              </p>
              <p className="text-gray-700 leading-relaxed">
                BY CREATING AN ACCOUNT OR USING THE SERVICE, YOU ACKNOWLEDGE
                THAT YOU HAVE READ THESE TERMS, UNDERSTAND THEM, AND AGREE TO BE
                BOUND BY THEM. IF YOU DO NOT AGREE TO THESE TERMS, YOU MAY NOT
                ACCESS OR USE THE SERVICE.
              </p>
            </div>
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
