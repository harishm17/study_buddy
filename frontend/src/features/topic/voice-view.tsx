import { Microphone } from '@phosphor-icons/react/dist/ssr'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * Voice review for a topic. The voice coach is built separately; the design lead wires it in
 * here. Until then this view says so.
 */
export function VoiceView() {
  return (
    <EmptyState icon={<Microphone />} title="Voice review is being rebuilt">
      You will be able to answer questions out loud about this topic and get feedback, like a study
      partner. For now, the notes, practice and quiz are ready.
    </EmptyState>
  )
}
