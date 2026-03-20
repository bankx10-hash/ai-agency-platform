export default function PrivacyPolicy() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-gray-500 mb-10">Last updated: March 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
        <p className="text-gray-700">
          Nodus AI Systems ("we", "our", or "us") operates an AI-powered agency platform. This Privacy Policy explains how we collect, use, and protect your information when you use our services.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">2. Information We Collect</h2>
        <ul className="list-disc pl-5 text-gray-700 space-y-2">
          <li>Account information (name, email address)</li>
          <li>Business information (business name, description)</li>
          <li>Social media account tokens (Facebook, Instagram, LinkedIn) — used solely to post content on your behalf</li>
          <li>Email account credentials (Gmail) — used solely to send emails on your behalf</li>
          <li>Payment information (processed securely via Stripe — we do not store card details)</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">3. How We Use Your Information</h2>
        <ul className="list-disc pl-5 text-gray-700 space-y-2">
          <li>To provide and operate our AI agency services</li>
          <li>To post social media content on your behalf using your connected accounts</li>
          <li>To send emails on your behalf using your connected Gmail account</li>
          <li>To process payments and manage your subscription</li>
          <li>To improve our platform and services</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">4. Data Security</h2>
        <p className="text-gray-700">
          All credentials and access tokens are encrypted using AES-256 encryption before being stored. We never store or share your credentials with third parties beyond what is necessary to provide our services.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">5. Third-Party Services</h2>
        <p className="text-gray-700">
          Our platform integrates with third-party services including Facebook, Instagram, LinkedIn, and Gmail. Your use of these integrations is also subject to the respective privacy policies of those platforms.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">6. Data Retention</h2>
        <p className="text-gray-700">
          We retain your data for as long as your account is active. You may request deletion of your data at any time by contacting us. Upon cancellation, your credentials and connected account tokens are deleted within 30 days.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">7. Your Rights</h2>
        <p className="text-gray-700">
          You have the right to access, correct, or delete your personal data at any time. To exercise these rights, please contact us at the email below.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">8. Contact Us</h2>
        <p className="text-gray-700">
          If you have any questions about this Privacy Policy, please contact us at:{' '}
          <a href="mailto:hello@nodusaisystems.com" className="text-blue-600 underline">
            hello@nodusaisystems.com
          </a>
        </p>
      </section>
    </div>
  )
}
