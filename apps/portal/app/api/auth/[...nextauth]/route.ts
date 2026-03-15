import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        try {
          const response = await axios.post(`${API_URL}/auth/login`, {
            email: credentials.email,
            password: credentials.password
          })

          const { client, token } = response.data

          if (client && token) {
            return {
              id: client.id,
              email: client.email,
              name: client.businessName,
              clientId: client.id,
              token
            }
          }

          return null
        } catch {
          return null
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.clientId = (user as { clientId?: string }).clientId
        token.accessToken = (user as { token?: string }).token
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { clientId?: string }).clientId = token.clientId as string
        (session as { accessToken?: string }).accessToken = token.accessToken as string
      }
      return session
    }
  },
  pages: {
    signIn: '/login'
  },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60
  },
  secret: process.env.NEXTAUTH_SECRET
})

export { handler as GET, handler as POST }
