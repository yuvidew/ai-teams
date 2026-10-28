"use client"

import * as Sentry from "@sentry/nextjs"
import NextError from "next/error"
import { useEffect } from "react"

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        {/* App Router doesn't expose the HTTP status here, so 0 renders a generic message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  )
}
