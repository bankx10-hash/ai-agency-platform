export default function DataDeletion() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Data Deletion Request</h1>
      <p className="text-gray-500 mb-10">Last updated: March 2026</p>

      <section className="mb-8">
        <p className="text-gray-700 mb-4">
          If you would like to delete your data from Nodus AI Systems, you can request deletion by emailing us or by cancelling your account through the platform.
        </p>
        <p className="text-gray-700 mb-4">
          Upon receiving your request, we will delete all your personal data, connected account credentials, and any content generated on your behalf within 30 days.
        </p>
        <p className="text-gray-700">
          To request data deletion, contact us at:{' '}
          <a href="mailto:hello@nodusaisystems.com" className="text-blue-600 underline">
            hello@nodusaisystems.com
          </a>
        </p>
      </section>
    </div>
  )
}
