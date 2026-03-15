import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

export async function POST(req: NextRequest) {
  try {
    const body = await req.arrayBuffer()
    const signature = req.headers.get('stripe-signature') || ''

    const response = await fetch(`${API_URL}/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': signature
      },
      body
    })

    const data = await response.json()

    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('Stripe webhook proxy error:', error)
    return NextResponse.json(
      { error: 'Webhook proxy error' },
      { status: 500 }
    )
  }
}
