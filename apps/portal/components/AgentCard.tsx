'use client'

import { useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import AgentStatusBadge from './AgentStatusBadge'

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

interface AgentCardProps {
  agent: AgentDeployment
  onStatusChange?: (agentId: string, newStatus: string) => void
  showConfigure?: boolean
}

const agentConfig: Record<string, { label: string; icon: string; metricLabel: string; metricKey: string; color: string }> = {
  LEAD_GENERATION: {
    label: 'Lead Generation',
    icon: '🎯',
    metricLabel: 'Leads today',
    metricKey: 'leadsToday',
    color: 'from-blue-500 to-cyan-500'
  },
  LINKEDIN_OUTREACH: {
    label: 'LinkedIn Outreach',
    icon: '💼',
    metricLabel: 'Connections sent',
    metricKey: 'connectionsSent',
    color: 'from-blue-600 to-blue-800'
  },
  SOCIAL_MEDIA: {
    label: 'Social Media',
    icon: '📱',
    metricLabel: 'Posts published',
    metricKey: 'postsPublished',
    color: 'from-pink-500 to-rose-500'
  },
  ADVERTISING: {
    label: 'Advertising',
    icon: '📊',
    metricLabel: 'Ads optimised',
    metricKey: 'adsOptimised',
    color: 'from-orange-500 to-amber-500'
  },
  APPOINTMENT_SETTER: {
    label: 'Appointment Setter',
    icon: '📅',
    metricLabel: 'Appointments today',
    metricKey: 'appointmentsToday',
    color: 'from-green-500 to-emerald-500'
  },
  VOICE_INBOUND: {
    label: 'Voice Inbound',
    icon: '📞',
    metricLabel: 'Calls answered',
    metricKey: 'callsAnswered',
    color: 'from-indigo-500 to-purple-600'
  },
  VOICE_OUTBOUND: {
    label: 'Voice Outbound',
    icon: '📲',
    metricLabel: 'Calls made',
    metricKey: 'callsMade',
    color: 'from-purple-500 to-violet-600'
  },
  VOICE_CLOSER: {
    label: 'Voice Closer',
    icon: '🤝',
    metricLabel: 'Deals closed',
    metricKey: 'dealsClosed',
    color: 'from-violet-600 to-pink-600'
  },
  CLIENT_SERVICES: {
    label: 'Client Services',
    icon: '💎',
    metricLabel: 'Clients helped',
    metricKey: 'clientsHelped',
    color: 'from-teal-500 to-cyan-600'
  }
}

export default function AgentCard({ agent, onStatusChange, showConfigure }: AgentCardProps) {
  const [toggling, setToggling] = useState(false)
  const config = agentConfig[agent.agentType] || {
    label: agent.agentType.replace(/_/g, ' '),
    icon: '🤖',
    metricLabel: 'Actions',
    metricKey: 'totalLeads',
    color: 'from-gray-500 to-gray-700'
  }

  const metricValue = (agent.metrics as Record<string, number | undefined> | undefined)?.[config.metricKey] || 0

  async function handleToggle() {
    setToggling(true)
    const token = localStorage.getItem('token') || ''
    const action = agent.status === 'ACTIVE' ? 'pause' : 'resume'

    try {
      await axios.post(
        `${API_URL}/agents/${agent.id}/${action}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      )

      const newStatus = action === 'pause' ? 'PAUSED' : 'ACTIVE'
      onStatusChange?.(agent.id, newStatus)
    } catch (err) {
      console.error('Failed to toggle agent:', err)
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      <div className={`bg-gradient-to-br ${config.color} p-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{config.icon}</span>
            <AgentStatusBadge status={agent.status} size="sm" />
          </div>
          <button
            onClick={handleToggle}
            disabled={toggling || agent.status === 'ERROR' || agent.status === 'INACTIVE'}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
              agent.status === 'ACTIVE' ? 'bg-white/30' : 'bg-black/20'
            }`}
            title={agent.status === 'ACTIVE' ? 'Pause agent' : 'Resume agent'}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              agent.status === 'ACTIVE' ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
        <h3 className="text-white font-bold text-base mt-3">{config.label} Agent</h3>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{config.metricLabel}</p>
            <p className="text-2xl font-black text-gray-900 mt-0.5">{metricValue.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Total leads</p>
            <p className="text-lg font-bold text-gray-700">{(agent.metrics?.totalLeads || 0).toLocaleString()}</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Updated {new Date(agent.updatedAt).toLocaleDateString()}
          </p>

          {showConfigure && (
            <Link
              href={`/dashboard/agents/${agent.id}/configure`}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              Configure →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
