"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"

import { toast } from "@/components/ui/toast"

/**
 * Error toast for a blocked billable action, with a shortcut to /pricing (not
 * on the plan) or /usage (plan allowance used up).
 */
export function useUpgradeToast() {
  const router = useRouter()

  return useCallback(
    (description: string, href: "/pricing" | "/usage" = "/pricing") => {
      toast.add({
        type: "error",
        title: href === "/pricing" ? "Upgrade required" : "Limit reached",
        description,
        actionProps: {
          children: href === "/pricing" ? "View plans" : "View usage",
          onClick: () => router.push(href),
        },
      })
    },
    [router]
  )
}
