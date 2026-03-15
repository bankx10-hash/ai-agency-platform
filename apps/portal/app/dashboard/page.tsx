'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import axios from 'axios'
import AgentCard from '../../components/AgentCard'
import MetricsDashboard from '../../components/MetricsDashboard'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

interface AgentDeployment {
  id: string
  agentType: string
  status: 'ACTIVE' | 'INACTIVE' | 'PAUSED' | 'ERROR'
  metrics?: {
    totalLeads?: number
    leadsToday?: number
    callsMade?: number
    appointmentsBooked?: number
    emailsSent?: number
    appointmentsToday?: number
  }
  updatedAt: string
}

interface DashboardMetrics {
  leadsToday: number
  callsMade: number
  appointmentsBooked: number
  emailsSent: number
  activeAgents: number
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [agents, setAgents] = useState<AgentDeployment[]>([])
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    leadsToday: 0,
    callsMade: 0,
    appointmentsBooked: 0,
    emailsSent: 0,
    activeAgents: 0
  })
  const [businessName, setBusinessName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  useEffect(() => {
    if (!session) return

    const fetchData = async () => {
      try {
        const clientId = (session.user as { clientId?: string })?.clientId
        const token = localStorage.getItem('token') || ''

        if (!clientId) return

        const [clientRes, agentsRes] = await Promise.all([
          axios.get(`${API_URL}/clients/${clientId}`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get(`${API_URL}/clients/${clientId}/agents`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ])

        const clientData = clientRes.data.client
        const agentsData: AgentDeployment[] = agentsRes.data.agents

        setBusinessName(clientData.businessName)
        setAgents(agentsData)

        const computedMetrics = agentsData.reduce((acc, agent) => {
          const m = agent.metrics || {}
          return {
            leadsToday: acc.leadsToday + (m.leadsToday || 0),
            callsMade: acc.callsMade + (m.callsMade || 0),
            appointmentsBooked: acc.appointmentsBooked + (m.appointmentsBooked || 0),
            emailsSent: acc.emailsSent + (m.emailsSent || 0),
            activeAgents: acc.activeAgents + (agent.status === 'ACTIVE' ? 1 : 0)
          }
        }, { leadsToday: 0, callsMade: 0, appointmentsBooked: 0, emailsSent: 0, activeAgents: 0 })

        setMetrics(computedMetrics)
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [session])

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-bold text-gray-900 text-lg">AI Agency Platform</span>
          </div>

          <nav className="hidden md:flex items-center gap-6">
            <Link href="/dashboard" className="text-sm font-medium text-indigo-600">Dashboard</Link>
            <Link href="/dashboard/agents" className="text-sm font-medium text-gray-600 hover:text-gray-900">Agents</Link>
            <Link href="/dashboard/analytics" className="text-sm font-medium text-gray-600 hover:text-gray-900">Analytics</Link>
            <Link href="/dashboard/settings" className="text-sm font-medium text-gray-600 hover:text-gray-900">Settings</Link>
          </nav>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-semibold text-sm">
              {businessName.charAt(0)}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <p className="text-sm text-gray-500">{today}</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">
            Good morning, {businessName} 👋
          </h1>
          <p className="text-gray-600 mt-1">
            Your AI agents are working hard. Here&apos;s what&apos;s happened today.
          </p>
        </div>

        <MetricsDashboard metrics={metrics} />

        <div className="mt-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Your AI Agents</h2>
            <Link
              href="/dashboard/agents"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              View all →
            </Link>
          </div>

          {agents.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
              <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No agents deployed yet</h3>
              <p className="text-gray-500 text-sm mb-6">Your agents are being set up. This usually takes 2-3 minutes.</p>
              <Link
                href="/onboarding/complete"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
              >
                Check setup status
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {agents.slice(0, 6).map(agent => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onStatusChange={() => {}}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
