export default function TermsOfService() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-gray-500 mb-10">Last updated: March 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
        <p className="text-gray-700">
          By accessing or using the Nodus AI Systems platform, you agree to be bound by these Terms of Service. If you do not agree, please do not use our services.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
        <p className="text-gray-700">
          Nodus AI Systems provides an AI-powered agency platform that automates social media posting, email outreach, lead generation, and other marketing activities on behalf of subscribed clients.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">3. Account Responsibilities</h2>
        <ul className="list-disc pl-5 text-gray-700 space-y-2">
          <li>You are responsible for maintaining the confidentiality of your account credentials</li>
          <li>You must provide accurate and complete information when creating your account</li>
          <li>You are responsible for all activity that occurs under your account</li>
          <li>You must notify us immediately of any unauthorised use of your account</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">4. Connected Accounts</h2>
        <p className="text-gray-700">
          By connecting your social media or email accounts, you authorise Nodus AI Systems to post content and send communications on your behalf. You may revoke this access at any time through your account settings or directly through the respective platform.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">5. Acceptable Use</h2>
        <p className="text-gray-700">You agree not to use our platform to:</p>
        <ul className="list-disc pl-5 text-gray-700 space-y-2 mt-2">
          <li>Post spam, misleading, or illegal content</li>
          <li>Violate any applicable laws or regulations</li>
          <li>Infringe on the intellectual property rights of others</li>
          <li>Violate the terms of service of any connected platform (Facebook, Instagram, LinkedIn, etc.)</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">6. Subscription and Billing</h2>
        <p className="text-gray-700">
          Subscriptions are billed monthly. You may cancel at any time. Refunds are not provided for partial months. We reserve the right to suspend accounts with failed payments after a grace period.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">7. Limitation of Liability</h2>
        <p className="text-gray-700">
          Nodus AI Systems is not liable for any indirect, incidental, or consequential damages arising from your use of the platform, including but not limited to loss of business, revenue, or data.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">8. Termination</h2>
        <p className="text-gray-700">
          We reserve the right to suspend or terminate accounts that violate these terms. You may cancel your account at any time through the platform settings.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">9. Changes to Terms</h2>
        <p className="text-gray-700">
          We may update these terms from time to time. Continued use of the platform after changes constitutes acceptance of the new terms.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">10. Contact</h2>
        <p className="text-gray-700">
          For questions about these terms, contact us at:{' '}
          <a href="mailto:hello@nodusaisystems.com" className="text-blue-600 underline">
            hello@nodusaisystems.com
          </a>
        </p>
      </section>
    </div>
  )
}
