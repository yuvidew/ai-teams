import { PricingTable } from "@clerk/nextjs"
import { auth } from "@clerk/nextjs/server"

export default async function PricingPage() {
  await auth.protect()

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-8 p-6 py-16">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold">Choose a plan</h1>
        <p className="text-sm text-muted-foreground">
          Pro unlocks bots and sandboxes. The free plan has them turned off.
        </p>
      </div>
      <PricingTable />
    </div>
  )
}
