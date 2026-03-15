'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import axios from 'axios'
import AgentCard from '../../../components/AgentCard'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

interface AgentDeployment {
  id: string
  agentType: string
  status: 'ACTIVE' | 'INACTIVE' | 'PAUSED' | 'ERROR'
  metrics?: Record<string, number | string>
  config?: Record<string, unknown>
  updatedAt: string
  n8nWorkflowId?: string
}

export default function AgentsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [agents, setAgents] = useState<AgentDeployment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'ACTIVE' | 'PAUSED' | 'ERROR'>('all')

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

  function handleStatusChange(agentId: string, newStatus: string) {
    setAgents(prev => prev.map(a =>
      a.id === agentId ? { ...a, status: newStatus as AgentDeployment['status'] } : a
    ))
  }

  const filteredAgents = filter === 'all' ? agents : agents.filter(a => a.status === filter)

  const statusCounts = agents.reduce((acc, a) => ({
    ...acc,
    [a.status]: (acc[a.status] || 0) + 1
  }), {} as Record<string, number>)

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
            <h1 className="text-xl font-bold text-gray-900">AI Agents</h1>
          </div>

          <nav className="hidden md:flex items-center gap-6">
            <Link href="/dashboard" className="text-sm font-medium text-gray-600 hover:text-gray-900">Dashboard</Link>
            <Link href="/dashboard/agents" className="text-sm font-medium text-indigo-600">Agents</Link>
            <Link href="/dashboard/analytics" className="text-sm font-medium text-gray-600 hover:text-gray-900">Analytics</Link>
            <Link href="/dashboard/settings" className="text-sm font-medium text-gray-600 hover:text-gray-900">Settings</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center gap-3 mb-8">
          {(['all', 'ACTIVE', 'PAUSED', 'ERROR'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                filter === f
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f === 'all' ? 'All' : f}
              <span className="ml-2 text-xs opacity-75">
                ({f === 'all' ? agents.length : statusCounts[f] || 0})
              </span>
            </button>
          ))}
        </div>

        {filteredAgents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <p className="text-gray-500">No agents found with status: {filter}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAgents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onStatusChange={handleStatusChange}
                showConfigure
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
