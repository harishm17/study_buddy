import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { clientIp, createRateLimiter } from '@/lib/api/rate-limit'

// 5 signups a minute per address. The counts are kept per server instance, so with several
// instances the real limit is 5 x instances. See lib/api/rate-limit.
const signupLimiter = createRateLimiter({ limit: 5, windowMs: 60_000 })

const signupSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .toLowerCase()
    .max(254, 'Email is too long')
    .email('Invalid email format'),
  // bcrypt only reads the first 72 bytes, so a longer password adds nothing.
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters long')
    .max(72, 'Password must be at most 72 characters long'),
  name: z
    .string()
    .trim()
    .max(100, 'Name must be at most 100 characters long')
    .nullish()
    .transform((value) => value || null),
})

export async function POST(req: NextRequest) {
  try {
    const limit = signupLimiter.check(clientIp(req))
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many signup attempts. Please wait a minute and try again.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = signupSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }
    const { email, password, name } = parsed.data

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      )
    }

    // Hash password
    const passwordHash = await hash(password, 12)

    // Create user. Two signups can both pass the check above; the unique index on email
    // lets one win and the other lands in the P2002 branch below.
    try {
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name,
        },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
        },
      })

      return NextResponse.json(
        {
          message: 'User created successfully',
          user,
        },
        { status: 201 }
      )
    } catch (createError) {
      if (createError instanceof Prisma.PrismaClientKnownRequestError && createError.code === 'P2002') {
        return NextResponse.json(
          { error: 'User with this email already exists' },
          { status: 409 }
        )
      }
      throw createError
    }
  } catch (error) {
    console.error('Signup error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
