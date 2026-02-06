/**
 * NextAuth configuration
 */

import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'

const nextAuthSecret =
  process.env.NEXTAUTH_SECRET ||
  process.env.AUTH_SECRET ||
  'studybuddy-dev-insecure-secret'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required')
        }

        // Find user by email
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        })

        if (!user || !user.passwordHash) {
          throw new Error('Invalid email or password')
        }

        // Verify password
        const isPasswordValid = await compare(
          credentials.password,
          user.passwordHash
        )

        if (!isPasswordValid) {
          throw new Error('Invalid email or password')
        }

        // Return user object
        return {
          id: user.id,
          email: user.email,
          name: user.name,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
      }
      return session
    },
  },
  logger: {
    error(code, metadata) {
      // Common when a cookie was signed with an older NEXTAUTH_SECRET.
      // Keep runtime logs clean while users refresh/sign in again.
      const metadataMessage =
        typeof metadata === 'object' && metadata && 'message' in metadata
          ? String((metadata as { message?: unknown }).message ?? '')
          : ''
      const metadataUrl =
        typeof metadata === 'object' && metadata && 'url' in metadata
          ? String((metadata as { url?: unknown }).url ?? '')
          : ''
      if (
        code === 'JWT_SESSION_ERROR' &&
        metadataMessage.toLowerCase().includes('decryption operation failed')
      ) {
        return
      }
      if (
        code === 'CLIENT_FETCH_ERROR' &&
        metadataUrl === '/api/auth/session' &&
        metadataMessage.toLowerCase().includes('load failed')
      ) {
        return
      }
      console.error(`[next-auth][error][${code}]`, metadata)
    },
  },
  secret: nextAuthSecret,
}
