'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

interface OnboardingStep {
  label: string
  key: string
  completed: boolean
}

export default function OnboardingCompletePage() {
  const router = useRouter()
  const [steps, setSteps] = useState<OnboardingStep[]>([
    { label: 'Creating your workspace', key: 'ghlCreated', completed: false },
    { label: 'Connecting your email', key: 'emailConnected', completed: false },
    { label: 'Deploying your AI agents', key: 'agentsDeployed', completed: false },
    { label: 'Assigning phone numbers', key: 'voiceAssigned', completed: false },
    { label: 'Running final checks', key: 'welcomeEmailSent', completed: false }
  ])
  const [currentMessage, setCurrentMessage] = useState('Initialising your AI workforce...')
  const [isComplete, setIsComplete] = useState(false)
  const [dots, setDots] = useState('')

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.')
    }, 500)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const messages = [
      'Configuring your GoHighLevel workspace...',
      'Training your AI agents on your business...',
      'Setting up voice phone numbers...',
      'Deploying workflow automations...',
      'Running quality checks...',
      'Almost ready!'
    ]

    let msgIndex = 0
    const msgInterval = setInterval(() => {
      msgIndex = (msgIndex + 1) % messages.length
      setCurrentMessage(messages[msgIndex])
    }, 3000)

    return () => clearInterval(msgInterval)
  }, [])

  useEffect(() => {
    const clientId = localStorage.getItem('clientId')
    const token = localStorage.getItem('token')

    if (!clientId || !token) {
      router.push('/login')
      return
    }

    const poll = async () => {
      try {
        const response = await axios.get(
          `${API_URL}/onboarding/${clientId}/status`,
          { headers: { Authorization: `Bearer ${token}` } }
        )

        const { onboarding } = response.data
        const data = onboarding.data as Record<string, boolean>

        setSteps(prev => prev.map(step => ({
          ...step,
          completed: !!data[step.key]
        })))

        if (onboarding.status === 'COMPLETED') {
          setIsComplete(true)
          setCurrentMessage('Your AI workforce is ready!')

          setTimeout(() => {
            router.push('/dashboard')
          }, 2000)
        }
      } catch (err) {
        console.error('Failed to fetch onboarding status:', err)
      }
    }

    poll()
    const interval = setInterval(poll, 3000)

    return () => clearInterval(interval)
  }, [router])

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center px-4">
      <div className="max-w-lg w-full">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-indigo-100 text-indigo-700 px-4 py-1.5 rounded-full text-sm font-medium mb-4">
            <span>Step 3 of 3</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            {isComplete ? 'Your AI Agents Are Live!' : 'Setting Everything Up'}
          </h1>
          <p className="mt-3 text-gray-600">
            {isComplete
              ? 'Redirecting you to your dashboard...'
              : `${currentMessage}${dots}`
            }
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {!isComplete && (
            <div className="flex justify-center mb-8">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full border-4 border-indigo-100" />
                <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {isComplete && (
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {steps.map((step, index) => (
              <div key={step.key} className="flex items-center gap-4">
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 ${
                  step.completed
                    ? 'bg-green-100'
                    : !isComplete && index === steps.findIndex(s => !s.completed)
                    ? 'bg-indigo-100 animate-pulse'
                    : 'bg-gray-100'
                }`}>
                  {step.completed ? (
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : !isComplete && index === steps.findIndex(s => !s.completed) ? (
                    <svg className="w-4 h-4 text-indigo-600 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <div className="w-2 h-2 bg-gray-300 rounded-full" />
                  )}
                </div>

                <span className={`text-sm font-medium transition-colors duration-300 ${
                  step.completed ? 'text-gray-900' : 'text-gray-400'
                }`}>
                  {step.label}
                </span>

                {step.completed && (
                  <span className="ml-auto text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                    Done
                  </span>
                )}
              </div>
            ))}
          </div>

          {!isComplete && (
            <p className="text-center text-xs text-gray-400 mt-8">
              This usually takes 2-3 minutes. Please keep this page open.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
