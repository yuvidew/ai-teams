"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"

import { toast } from "@/components/ui/toast"

/** Error toast for a blocked billable action, with a shortcut to /pricing. */
export function useUpgradeToast() {
  const router = useRouter()

  return useCallback(
    (description: string) => {
      toast.add({
        type: "error",
        title: "Upgrade required",
        description,
        actionProps: {
          children: "View plans",
          onClick: () => router.push("/pricing"),
        },
      })
    },
    [router]
  )
}
