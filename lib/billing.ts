import { auth } from "@clerk/nextjs/server"

/** Billable features of the Pro plan; the free plan has none of them. */
export type BillingFeature = "bots" | "sandboxes"

export const UPGRADE_MESSAGE =
  "Your free plan doesn't include this. Upgrade to Pro to unlock bots and sandboxes."

/** True when the signed-in user's plan includes every given feature. */
export async function hasFeatures(...features: BillingFeature[]) {
  const { has } = await auth()

  return features.every((feature) => has({ feature }))
}
