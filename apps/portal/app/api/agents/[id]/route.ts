import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

async function getAuthHeader(req: NextRequest): Promise<string> {
  const authHeader = req.headers.get('authorization')
  return authHeader || ''
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = await getAuthHeader(req)

    const response = await fetch(`${API_URL}/agents/${params.id}/metrics`, {
      headers: { Authorization: authHeader }
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('Agent proxy GET error:', error)
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = await getAuthHeader(req)
    const body = await req.json()

    const response = await fetch(`${API_URL}/agents/${params.id}/config`, {
      method: 'PATCH',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('Agent proxy PATCH error:', error)
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = await getAuthHeader(req)
    const { action } = await req.json() as { action: string }

    if (!['pause', 'resume'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const response = await fetch(`${API_URL}/agents/${params.id}/${action}`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      }
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('Agent proxy POST error:', error)
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 })
  }
}
