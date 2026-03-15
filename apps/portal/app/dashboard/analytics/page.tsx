'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import axios from 'axios'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

const COLORS = ['#667eea', '#764ba2', '#06d6a0', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']

function generateMockData() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return days.map(day => ({
    day,
    leads: Math.floor(Math.random() * 20) + 5,
    calls: Math.floor(Math.random() * 15) + 3,
    appointments: Math.floor(Math.random() * 8) + 1,
    emails: Math.floor(Math.random() * 30) + 10
  }))
}

interface AgentDeployment {
  id: string
  agentType: string
  status: string
  metrics?: {
    totalLeads?: number
    callsMade?: number
    appointmentsBooked?: number
    emailsSent?: number
    errors?: number
  }
}

export default function AnalyticsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [agents, setAgents] = useState<AgentDeployment[]>([])
  const [weeklyData] = useState(generateMockData())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (!session) return

    const fetchAgents = async () => {
      try {
        const clientId = (session.user as { clientId?: string })?.clientId
        const token = localStorage.getItem('token') || ''

        const response = await axios.get(`${API_URL}/clients/${clientId}/agents`, {
          headers: { Authorization: `Bearer ${token}` }
        })

        setAgents(response.data.agents)
      } catch (err) {
        console.error('Failed to fetch agents:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchAgents()
  }, [session])

  const agentPieData = agents.map((agent, i) => ({
    name: agent.agentType.replace(/_/g, ' '),
    value: (agent.metrics?.totalLeads || 0) + (agent.metrics?.callsMade || 0),
    color: COLORS[i % COLORS.length]
  })).filter(d => d.value > 0)

  const totalMetrics = agents.reduce((acc, a) => ({
    leads: acc.leads + (a.metrics?.totalLeads || 0),
    calls: acc.calls + (a.metrics?.callsMade || 0),
    appointments: acc.appointments + (a.metrics?.appointmentsBooked || 0),
    emails: acc.emails + (a.metrics?.emailsSent || 0)
  }), { leads: 0, calls: 0, appointments: 0, emails: 0 })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/dashboard" className="text-sm font-medium text-gray-600 hover:text-gray-900">Dashboard</Link>
            <Link href="/dashboard/agents" className="text-sm font-medium text-gray-600 hover:text-gray-900">Agents</Link>
            <Link href="/dashboard/analytics" className="text-sm font-medium text-indigo-600">Analytics</Link>
            <Link href="/dashboard/settings" className="text-sm font-medium text-gray-600 hover:text-gray-900">Settings</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Leads', value: totalMetrics.leads, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Calls Made', value: totalMetrics.calls, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Appointments', value: totalMetrics.appointments, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Emails Sent', value: totalMetrics.emails, color: 'text-blue-600', bg: 'bg-blue-50' }
          ].map(metric => (
            <div key={metric.label} className={`${metric.bg} rounded-xl p-4`}>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{metric.label}</p>
              <p className={`text-3xl font-black ${metric.color} mt-1`}>{metric.value.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">All time</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-6">Weekly Activity</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="leads" stroke="#667eea" strokeWidth={2} dot={{ r: 4 }} name="Leads" />
                <Line type="monotone" dataKey="calls" stroke="#764ba2" strokeWidth={2} dot={{ r: 4 }} name="Calls" />
                <Line type="monotone" dataKey="appointments" stroke="#06d6a0" strokeWidth={2} dot={{ r: 4 }} name="Appointments" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-6">Email & Outreach Volume</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="emails" fill="#667eea" radius={[4, 4, 0, 0]} name="Emails" />
                <Bar dataKey="leads" fill="#764ba2" radius={[4, 4, 0, 0]} name="Leads" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {agentPieData.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-6">Activity by Agent</h2>
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={agentPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {agentPieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [value, 'Total Actions']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
