"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { Loader2Icon, RefreshCwIcon, XIcon } from "lucide-react"

import { getChatVncUrl, keepSandboxAlive } from "@/actions/sandbox"
import { Button } from "@/components/ui/button"
import { SANDBOX_AUTO_STOP_MINUTES } from "@/lib/daytona"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type VncState =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error"; error: string }

type VncContextValue = {
  state: VncState
  fullscreen: boolean
  setFullscreen: (open: boolean) => void
  setPreviewSlot: (el: HTMLElement | null) => void
  setDialogSlot: (el: HTMLElement | null) => void
  reload: () => void
}

const VncContext = createContext<VncContextValue | null>(null)

function useVnc() {
  const value = useContext(VncContext)
  if (!value) throw new Error("Must be used within VncProvider")
  return value
}

/**
 * Owns the one VNC iframe. Moving an iframe in the DOM reloads it, so it is
 * never re-parented: it floats above the page (fixed) and is laid over
 * whichever slot is active, the panel preview or the fullscreen dialog.
 */
function VncProvider({
  chatId,
  children,
}: {
  chatId: string
  children: React.ReactNode
}) {
  const [state, setState] = useState<VncState>({ status: "loading" })
  const [fullscreen, setFullscreen] = useState(false)
  const [previewSlot, setPreviewSlot] = useState<HTMLElement | null>(null)
  const [dialogSlot, setDialogSlot] = useState<HTMLElement | null>(null)
  const [attempt, setAttempt] = useState(0)
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    let cancelled = false

    getChatVncUrl(chatId)
      .then((result) => {
        if (cancelled) return
        setState(
          result.success
            ? { status: "ready", url: result.url }
            : { status: "error", error: result.error }
        )
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: "error", error: "Could not reach the server." })
        }
      })

    return () => {
      cancelled = true
    }
  }, [chatId, attempt])

  // While the screen is open the sandbox is in use: keep it awake.
  const ready = state.status === "ready"
  useEffect(() => {
    if (!ready) return

    const timer = setInterval(
      () => {
        if (document.visibilityState !== "visible") return

        keepSandboxAlive(chatId)
          .catch(() => {})
      },
      (SANDBOX_AUTO_STOP_MINUTES - 1) * 60 * 1000
    )

    return () => clearInterval(timer)
  }, [ready, chatId])

  const reload = useCallback(() => {
    setState({ status: "loading" })
    setAttempt((n) => n + 1)
  }, [])

  const target = fullscreen && dialogSlot ? dialogSlot : previewSlot
  const inDialog = target === dialogSlot && dialogSlot !== null

  // Track the active slot every frame: the panel animates and the dialog zooms
  // in, so its rect changes without any resize event.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    let raf = 0
    const sync = () => {
      const rect = target?.getBoundingClientRect()

      if (!rect || rect.width < 2 || rect.height < 2) {
        frame.style.visibility = "hidden"
      } else {
        frame.style.visibility = "visible"
        frame.style.width = `${rect.width}px`
        frame.style.height = `${rect.height}px`
        frame.style.transform = `translate(${rect.left}px, ${rect.top}px)`
      }

      raf = requestAnimationFrame(sync)
    }

    sync()
    return () => cancelAnimationFrame(raf)
  }, [target, state.status])

  return (
    <VncContext
      value={{
        state,
        fullscreen,
        setFullscreen,
        setPreviewSlot,
        setDialogSlot,
        reload,
      }}
    >
      {children}
      {state.status === "ready" && (
        <iframe
          ref={frameRef}
          src={state.url}
          title="Sandbox screen"
          allow="clipboard-read; clipboard-write"
          // The preview is click-to-expand, so only the fullscreen frame takes input.
          className={
            inDialog
              ? "pointer-events-auto fixed top-0 left-0 z-[60] border-0 bg-black"
              : "pointer-events-none fixed top-0 left-0 z-[60] rounded-md border-0 bg-black"
          }
          style={{ visibility: "hidden" }}
        />
      )}
      <VncDialog />
    </VncContext>
  )
}

function VncStatus() {
  const { state, reload } = useVnc()

  if (state.status === "ready") return null

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
      {state.status === "loading" ? (
        <>
          <Loader2Icon className="animate-spin" />
          Starting screen…
        </>
      ) : (
        <>
          {state.error}
          <Button variant="outline" size="sm" onClick={reload}>
            Try again
          </Button>
        </>
      )}
    </div>
  )
}

/** The panel's thumbnail slot. Clicking it opens the fullscreen dialog. */
function VncPreview({ name }: { name: string }) {
  const { state, setFullscreen, setPreviewSlot, reload } = useVnc()

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Reload screen"
          onClick={reload}
        >
          <RefreshCwIcon />
        </Button>
      </div>
      <div
        ref={setPreviewSlot}
        className="relative aspect-4/3 w-full overflow-hidden rounded-md border bg-muted"
      >
        <VncStatus />
        {state.status === "ready" && (
          <button
            type="button"
            aria-label="Open screen in fullscreen"
            onClick={() => setFullscreen(true)}
            className="absolute inset-0 cursor-zoom-in outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {name}&apos;s screen
      </p>
    </div>
  )
}

function VncDialog() {
  const { fullscreen, setFullscreen, setDialogSlot } = useVnc()

  return (
    <Dialog
      open={fullscreen}
      // Non-modal, so the page isn't inert and the iframe floating above the
      // popup still receives pointer and keyboard input.
      modal={false}
      onOpenChange={(open, details) => {
        // Only the close button may dismiss it; Escape, outside presses and
        // focus changes while driving the desktop must not.
        if (details.reason !== "close-press") {
          details.cancel()
          return
        }
        setFullscreen(open)
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 flex h-svh max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-none"
      >
        <DialogHeader className="flex-row items-center justify-between border-b p-2 pl-4">
          <DialogTitle>Screen</DialogTitle>
          <DialogClose
            render={<Button variant="ghost" size="icon-sm" />}
            aria-label="Close"
          >
            <XIcon />
          </DialogClose>
        </DialogHeader>
        <div ref={setDialogSlot} className="min-h-0 flex-1 bg-black" />
      </DialogContent>
    </Dialog>
  )
}

export { VncPreview, VncProvider }
