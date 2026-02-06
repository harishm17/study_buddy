import type { Metadata } from "next"
import { JetBrains_Mono, Manrope } from "next/font/google"
import "./globals.css"
import { SessionProvider } from "@/components/providers/session-provider"

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "StudyBuddy - AI-Powered Learning Platform",
  description: "Prepare for exams with AI-generated study materials, quizzes, and personalized learning paths",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${jetbrainsMono.variable}`}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
