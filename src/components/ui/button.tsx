import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding text-[14px] font-bold uppercase tracking-[1.4px] whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-[#da291c] text-white hover:bg-[#b01e0a]",
        outline:
          "border-[#303030] bg-transparent text-[#969696] hover:text-white hover:border-[#969696]",
        secondary:
          "bg-[#303030] text-white hover:bg-[#404040]",
        ghost:
          "bg-transparent text-[#969696] hover:text-white hover:bg-[#303030]",
        destructive:
          "bg-[#da291c] text-white hover:bg-[#b01e0a]",
        link: "text-[#da291c] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-12 gap-1.5 px-8",
        xs: "h-6 gap-1 px-2 text-[11px] tracking-[1.1px]",
        sm: "h-7 gap-1 px-4 text-[13px] tracking-[0.65px]",
        lg: "h-12 gap-1.5 px-8",
        icon: "size-12",
        "icon-xs": "size-6",
        "icon-sm": "size-7",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
