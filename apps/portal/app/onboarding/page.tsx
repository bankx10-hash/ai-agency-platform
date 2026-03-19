'use client'

import { useState } from 'react'
import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

const plans = [
  {
    id: 'STARTER',
    name: 'Starter',
    price: 97,
    description: 'Perfect for small businesses ready to automate lead generation and appointment booking.',
    agents: [
      'Lead Generation Agent',
      'Appointment Setter Agent',
      'Voice Inbound Agent (24/7)'
    ],
    color: 'from-blue-500 to-cyan-500',
  },
  {
    id: 'GROWTH',
    name: 'Growth',
    price: 297,
    description: 'Expand your reach with LinkedIn outreach, social media, and outbound calling.',
    agents: [
      'Lead Generation Agent',
      'LinkedIn Outreach Agent',
      'Social Media Agent',
      'Appointment Setter Agent',
      'Voice Inbound Agent (24/7)',
      'Voice Outbound Agent'
    ],
    color: 'from-indigo-500 to-purple-600',
    highlighted: true
  },
  {
    id: 'AGENCY',
    name: 'Agency',
    price: 697,
    description: 'Full AI workforce. Every agent working together to grow your business 24/7.',
    agents: [
      'Lead Generation Agent',
      'LinkedIn Outreach Agent',
      'Social Media Agent',
      'Advertising Optimisation Agent',
      'Appointment Setter Agent',
      'Voice Inbound Agent (24/7)',
      'Voice Outbound Agent',
      'Voice Closer Agent',
      'Client Services Agent'
    ],
    color: 'from-purple-600 to-pink-600'
  }
]

export default function OnboardingPage() {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSelectPlan(planId: string) {
    setSelectedPlan(planId)
    setLoading(true)
    setError('')

    try {
      const clientId = localStorage.getItem('clientId')
      const token = localStorage.getItem('token')

      if (!clientId || !token) {
        window.location.href = '/login'
        return
      }

      // TEST MODE: skip Stripe, update plan directly and go to connect step
      await axios.patch(
        `${API_URL}/clients/${clientId}`,
        { plan: planId },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      window.location.href = '/onboarding/connect'
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'Failed to select plan')
      } else {
        setError('An error occurred. Please try again.')
      }
      setSelectedPlan(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-indigo-100 text-indigo-700 px-4 py-1.5 rounded-full text-sm font-medium mb-4">
            <span>Step 1 of 3</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Choose your AI workforce plan</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Select the plan that matches your growth goals. All plans include automated setup — your agents will be live within minutes of payment.
          </p>
        </div>

        {error && (
          <div className="max-w-md mx-auto mb-8 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-600 text-center">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map(plan => (
            <div
              key={plan.id}
              className={`relative bg-white rounded-2xl shadow-lg overflow-hidden transition-transform hover:-translate-y-1 ${
                plan.highlighted ? 'ring-2 ring-indigo-500' : ''
              }`}
            >
              {plan.highlighted && (
                <div className="absolute top-0 left-0 right-0 bg-indigo-500 text-white text-xs font-semibold text-center py-1.5 tracking-wide uppercase">
                  Most Popular
                </div>
              )}

              <div className={`bg-gradient-to-br ${plan.color} p-6 ${plan.highlighted ? 'pt-10' : ''}`}>
                <h2 className="text-2xl font-bold text-white">{plan.name}</h2>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-black text-white">${plan.price}</span>
                  <span className="text-white/80">/month</span>
                </div>
              </div>

              <div className="p-6">
                <p className="text-gray-600 text-sm mb-6">{plan.description}</p>

                <div className="space-y-3 mb-8">
                  {plan.agents.map(agent => (
                    <div key={agent} className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-5 h-5 bg-green-100 rounded-full flex items-center justify-center mt-0.5">
                        <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-sm text-gray-700">{agent}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={loading}
                  className={`w-full py-3 px-4 bg-gradient-to-r ${plan.color} text-white font-semibold rounded-xl hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md`}
                >
                  {loading && selectedPlan === plan.id ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Setting up...
                    </span>
                  ) : `Start ${plan.name} Plan (Test)`}
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-gray-500 mt-8">
          Secure payment powered by Stripe. Cancel anytime. Agents deploy automatically after payment.
        </p>
      </div>
    </div>
  )
}
