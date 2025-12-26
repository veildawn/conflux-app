import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/utils/cn"

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
)

// Since we don't have @radix-ui/react-label installed in package.json, 
// I will implement a simple Label component instead of adding the dependency to keep it simple
// unless I see it was missed. Checking package.json again... 
// It is NOT in package.json. So I'll make a simple span/label wrapper.

const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
))
Label.displayName = "Label"

export { Label }

