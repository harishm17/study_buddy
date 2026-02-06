import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold text-inherit ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-primary/35 bg-gradient-to-b from-primary to-primary/90 text-primary-foreground shadow-[0_12px_24px_-16px_hsl(var(--primary))] hover:brightness-105 hover:text-primary-foreground",
        destructive:
          "border border-destructive/30 bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:text-destructive-foreground",
        outline:
          "border border-border/80 bg-white/80 text-foreground shadow-sm hover:border-primary/35 hover:bg-white hover:text-foreground",
        secondary:
          "border border-secondary/80 bg-secondary/85 text-secondary-foreground hover:bg-secondary hover:text-secondary-foreground",
        ghost: "text-muted-foreground hover:bg-white/80 hover:text-foreground",
        back:
          "border border-border/80 bg-white/90 text-foreground shadow-[0_12px_24px_-20px_rgba(15,41,74,0.9)] hover:border-primary/35 hover:bg-white hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-xl px-8 text-base",
        back: "h-11 rounded-2xl px-4 text-sm",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
