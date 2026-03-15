'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

export default function ConnectPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    businessDescription: '',
    icpDescription: '',
    crmType: 'none' as 'gohighlevel' | 'hubspot' | 'salesforce' | 'zoho' | 'none',
    crmApiKey: '',
    ghlLocationId: '',
    linkedinCookie: '',
    // Social media platform credentials
    metaPageId: '',
    metaAccessToken: '',
    instagramUserId: '',
    tiktokConnected: false,
    bufferToken: '',
    platforms: [] as string[]
  })

  function update(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function getToken() { return localStorage.getItem('token') || '' }
  function getClientId() { return localStorage.getItem('clientId') || '' }

  async function handleGmailConnect() {
    try {
      const token = getToken()
      const response = await axios.get(`${API_URL}/onboarding/gmail/auth-url`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      window.location.href = response.data.url
    } catch {
      setError('Failed to initiate Gmail connection')
    }
  }

  async function handleConnectCRM() {
    if (form.crmType === 'none') return

    setLoading(true)
    setError('')
    try {
      const clientId = getClientId()
      const token = getToken()

      await axios.post(
        `${API_URL}/onboarding/${clientId}/connect-crm`,
        {
          crmType: form.crmType,
          apiKey: form.crmApiKey,
          ...(form.crmType === 'gohighlevel' ? { locationId: form.ghlLocationId } : {})
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
    } catch {
      setError('Failed to connect CRM. Please check your API key and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const clientId = getClientId()
      const token = getToken()

      if (form.crmType !== 'none' && form.crmApiKey) {
        await handleConnectCRM()
      }

      if (form.linkedinCookie) {
        await axios.post(
          `${API_URL}/onboarding/${clientId}/connect-linkedin`,
          { sessionCookie: form.linkedinCookie },
          { headers: { Authorization: `Bearer ${token}` } }
        ).catch(() => {})
      }

      await axios.patch(
        `${API_URL}/clients/${clientId}`,
        {
          businessDescription: form.businessDescription,
          icpDescription: form.icpDescription
        },
        { headers: { Authorization: `Bearer ${token}` } }
      ).catch(() => {})

      await axios.post(
        `${API_URL}/onboarding/start`,
        { clientId },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      router.push('/onboarding/complete')
    } catch {
      setError('Setup failed. Please try again or contact support.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-indigo-100 text-indigo-700 px-4 py-1.5 rounded-full text-sm font-medium mb-4">
            <span>Step 2 of 3</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Connect your tools</h1>
          <p className="mt-2 text-gray-600">
            Help us personalise your AI agents. You can update these anytime from your dashboard.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-7 h-7 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-sm font-bold">1</span>
                Connect Gmail
              </h2>
              <button
                type="button"
                onClick={handleGmailConnect}
                className="flex items-center gap-3 px-5 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition font-medium text-gray-700"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.698 1.24 6.65l4.026 3.115z"/>
                  <path fill="#34A853" d="M16.04 18.013c-1.09.703-2.474 1.078-4.04 1.078a7.077 7.077 0 0 1-6.723-4.823l-4.04 3.067A11.965 11.965 0 0 0 12 24c2.933 0 5.735-1.043 7.834-3l-3.793-2.987z"/>
                  <path fill="#4A90E2" d="M19.834 21c2.195-2.048 3.62-5.096 3.62-9 0-.71-.109-1.473-.272-2.182H12v4.637h6.436c-.317 1.559-1.17 2.766-2.395 3.558L19.834 21z"/>
                  <path fill="#FBBC05" d="M5.277 14.268A7.12 7.12 0 0 1 4.909 12c0-.782.125-1.533.357-2.235L1.24 6.65A11.934 11.934 0 0 0 0 12c0 1.92.445 3.73 1.237 5.335l4.04-3.067z"/>
                </svg>
                Connect Gmail Account
              </button>
              <p className="text-xs text-gray-500 mt-2">
                We use this to send emails on your behalf. Your credentials are AES-256 encrypted.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-7 h-7 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                Connect your CRM (optional)
              </h2>
              <select
                value={form.crmType}
                onChange={e => update('crmType', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-gray-900 mb-3"
              >
                <option value="none">No existing CRM</option>
                <option value="gohighlevel">GoHighLevel (GHL)</option>
                <option value="hubspot">HubSpot</option>
                <option value="salesforce">Salesforce</option>
                <option value="zoho">Zoho CRM</option>
              </select>

              {form.crmType === 'gohighlevel' && (
                <div className="space-y-3 p-4 bg-orange-50 border border-orange-200 rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <span className="text-xs font-semibold text-orange-700">GoHighLevel credentials — find these in your GHL account</span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Location API Key <span className="text-gray-400 font-normal">(Settings → API Keys → Location API Key)</span>
                    </label>
                    <input
                      type="password"
                      value={form.crmApiKey}
                      onChange={e => update('crmApiKey', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-gray-900"
                      placeholder="Paste your GHL Location API Key..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Location ID <span className="text-gray-400 font-normal">(Settings → Business Info → Location ID)</span>
                    </label>
                    <input
                      type="text"
                      value={form.ghlLocationId}
                      onChange={e => update('ghlLocationId', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-gray-900"
                      placeholder="e.g. AbC12dEfGhIjKlMn"
                    />
                  </div>
                </div>
              )}

              {form.crmType !== 'none' && form.crmType !== 'gohighlevel' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {form.crmType.charAt(0).toUpperCase() + form.crmType.slice(1)} API Key
                  </label>
                  <input
                    type="password"
                    value={form.crmApiKey}
                    onChange={e => update('crmApiKey', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-gray-900"
                    placeholder="Paste your API key here..."
                  />
                </div>
              )}
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-7 h-7 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-sm font-bold">3</span>
                Social Media Platforms (optional)
              </h2>
              <p className="text-xs text-gray-500 mb-4">Connect the platforms you want your Social Media Agent to post to automatically.</p>

              {/* Platform toggles */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                {(['instagram', 'facebook', 'tiktok', 'linkedin', 'twitter'] as const).map(platform => (
                  <label key={platform} className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition ${form.platforms.includes(platform) ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input
                      type="checkbox"
                      checked={form.platforms.includes(platform)}
                      onChange={e => {
                        const updated = e.target.checked
                          ? [...form.platforms, platform]
                          : form.platforms.filter(p => p !== platform)
                        update('platforms', updated as unknown as string)
                      }}
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700 capitalize">{platform === 'twitter' ? 'Twitter / X' : platform.charAt(0).toUpperCase() + platform.slice(1)}</span>
                  </label>
                ))}
              </div>

              {/* Meta credentials (Facebook + Instagram) */}
              {(form.platforms.includes('facebook') || form.platforms.includes('instagram')) && (
                <div className="space-y-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-4">
                  <p className="text-xs font-semibold text-blue-700">Facebook / Instagram — Meta Business credentials</p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Page Access Token <span className="text-gray-400 font-normal">(Meta Business Suite → Settings → Page Access Tokens)</span></label>
                    <input type="password" value={form.metaAccessToken} onChange={e => update('metaAccessToken', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition text-gray-900"
                      placeholder="EAABsbCS4..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Facebook Page ID</label>
                    <input type="text" value={form.metaPageId} onChange={e => update('metaPageId', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition text-gray-900"
                      placeholder="123456789012345" />
                  </div>
                  {form.platforms.includes('instagram') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Instagram Business Account ID <span className="text-gray-400 font-normal">(GET /{"{page-id}"}?fields=instagram_business_account)</span></label>
                      <input type="text" value={form.instagramUserId} onChange={e => update('instagramUserId', e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition text-gray-900"
                        placeholder="17841400000000000" />
                    </div>
                  )}
                </div>
              )}

              {/* TikTok OAuth */}
              {form.platforms.includes('tiktok') && (
                <div className="p-4 bg-gray-900 rounded-xl mb-4">
                  <p className="text-xs font-semibold text-white mb-3">TikTok — Connect your account</p>
                  <button
                    type="button"
                    onClick={() => {
                      // Redirect to TikTok OAuth — backend generates the URL
                      window.open(`${API_URL}/auth/tiktok?clientId=${getClientId()}`, '_blank')
                      update('tiktokConnected', 'pending' as unknown as string)
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-lg text-sm font-semibold text-gray-900 hover:bg-gray-100 transition"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.75a8.18 8.18 0 004.79 1.52V6.82a4.85 4.85 0 01-1.02-.13z"/></svg>
                    Connect TikTok Account
                  </button>
                  <p className="text-xs text-gray-400 mt-2">A new tab will open for TikTok login. Return here after authorising.</p>
                </div>
              )}

              {/* Buffer token (LinkedIn + Twitter fallback) */}
              {(form.platforms.includes('linkedin') || form.platforms.includes('twitter') || form.platforms.length > 0) && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Buffer Access Token <span className="text-gray-400 font-normal">(optional — enables scheduling for all platforms)</span></label>
                  <input type="password" value={form.bufferToken} onChange={e => update('bufferToken', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition text-gray-900"
                    placeholder="Paste Buffer access token..." />
                  <p className="text-xs text-gray-500">Get this from buffer.com/developers after connecting your social accounts to Buffer.</p>
                </div>
              )}
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-7 h-7 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-sm font-bold">4</span>
                LinkedIn session cookie (optional)
              </h2>
              <input
                type="password"
                value={form.linkedinCookie}
                onChange={e => update('linkedinCookie', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-gray-900"
                placeholder="li_at=..."
              />
              <p className="text-xs text-gray-500 mt-2">
                Required for LinkedIn Outreach Agent. Follow our video guide to get this cookie from your browser.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-7 h-7 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-sm font-bold">5</span>
                Business description
              </h2>
              <textarea
                value={form.businessDescription}
                onChange={e => update('businessDescription', e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-gray-900 resize-none"
                placeholder="Describe your business, what you do, and who you serve..."
              />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-7 h-7 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-sm font-bold">6</span>
                Ideal customer profile (ICP)
              </h2>
              <textarea
                value={form.icpDescription}
                onChange={e => update('icpDescription', e.target.value)}
                rows={4}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-gray-900 resize-none"
                placeholder="Describe your ideal customer: industry, company size, role, pain points, budget, location..."
              />
              <p className="text-xs text-gray-500 mt-2">
                The more detail you provide, the better your AI agents will qualify and target the right prospects.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md text-lg"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Deploying your AI agents...
                </span>
              ) : 'Launch my AI agents →'}
            </button>

            <p className="text-center text-sm text-gray-500">
              You can skip optional fields and update them later from your dashboard
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
