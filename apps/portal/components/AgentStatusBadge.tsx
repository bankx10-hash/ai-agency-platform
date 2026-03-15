interface AgentStatusBadgeProps {
  status: 'ACTIVE' | 'INACTIVE' | 'PAUSED' | 'ERROR'
  size?: 'sm' | 'md'
}

const config: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  ACTIVE: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    dot: 'bg-green-500',
    label: 'Active'
  },
  INACTIVE: {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    dot: 'bg-gray-400',
    label: 'Inactive'
  },
  PAUSED: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-700',
    dot: 'bg-yellow-500',
    label: 'Paused'
  },
  ERROR: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    dot: 'bg-red-500',
    label: 'Error'
  }
}

export default function AgentStatusBadge({ status, size = 'md' }: AgentStatusBadgeProps) {
  const c = config[status] || config.INACTIVE
  const textSize = size === 'sm' ? 'text-xs' : 'text-xs'
  const padding = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1'
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'

  return (
    <span className={`inline-flex items-center gap-1.5 ${padding} ${c.bg} ${c.text} rounded-full font-medium ${textSize}`}>
      <span className={`${dotSize} ${c.dot} rounded-full ${status === 'ACTIVE' ? 'animate-pulse' : ''}`} />
      {c.label}
    </span>
  )
}
