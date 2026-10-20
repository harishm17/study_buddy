import { SessionProvider } from '@/components/providers/session-provider'

// The login page is the only place that reads the session on the client (useSession), so
// the provider, and its session fetch on every load and focus, lives here, not in the root.
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
