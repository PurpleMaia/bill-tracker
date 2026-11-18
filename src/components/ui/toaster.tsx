"use client"

import { useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

/** Below `sm` the toast viewport sits at the top of the screen. */
const PHONE_QUERY = "(max-width: 639px)"

export function Toaster() {
  const { toasts } = useToast()

  // Phones flick a top banner up to dismiss it; on larger screens toasts sit
  // bottom-right and swipe off to the right.
  const [isPhone, setIsPhone] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(PHONE_QUERY)
    const update = () => setIsPhone(mql.matches)
    update()
    mql.addEventListener("change", update)
    return () => mql.removeEventListener("change", update)
  }, [])

  return (
    <ToastProvider swipeDirection={isPhone ? "up" : "right"}>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
