import { Badge } from '@/components/ui/badge'
import { MathText } from '@/components/ui/math-text'

/** A key concept as a chip. It wraps rather than overflows, since concepts can hold math. */
export function ConceptChip({ children }: { children: string }) {
  return (
    <Badge className="h-auto min-h-5 max-w-full whitespace-normal py-0.5 text-left">
      <MathText>{children}</MathText>
    </Badge>
  )
}
