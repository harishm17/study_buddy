'use client'

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useShell } from './shell-provider'
import { SidebarContent } from './sidebar'

/** Below 1024px the sidebar is a left sheet with the same content. */
export function MobileNav() {
  const { mobileNavOpen, setMobileNavOpen } = useShell()
  return (
    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <SheetContent side="left" hideClose aria-describedby={undefined} className="lg:hidden">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">Courses, topics and account</SheetDescription>
        <SidebarContent />
      </SheetContent>
    </Sheet>
  )
}
