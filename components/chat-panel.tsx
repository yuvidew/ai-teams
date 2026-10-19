"use client"

import { createContext, useContext, useRef } from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { ResizablePanel } from "@/components/ui/resizable"

const ChatPanelContext =
  createContext<React.RefObject<PanelImperativeHandle | null> | null>(null)

function useChatPanelRef() {
  const ref = useContext(ChatPanelContext)
  if (!ref) throw new Error("Must be used within ChatPanelProvider")
  return ref
}

function ChatPanelProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<PanelImperativeHandle | null>(null)
  return <ChatPanelContext value={ref}>{children}</ChatPanelContext>
}

function ChatPanel({ children }: { children?: React.ReactNode }) {
  const ref = useChatPanelRef()
  return (
    <ResizablePanel
      panelRef={ref}
      className="overflow-hidden transition-[flex-grow] duration-300 ease-in-out motion-reduce:transition-none"
      collapsible
      collapsedSize="0%"
      defaultSize="0%"
      minSize="20%"
      maxSize="60%"
    >
      {children}
    </ResizablePanel>
  )
}

function useToggleChatPanel() {
  const ref = useChatPanelRef()
  return () => {
    const panel = ref.current
    if (!panel) return
    if (panel.isCollapsed()) panel.expand()
    else panel.collapse()
  }
}

export { ChatPanel, ChatPanelProvider, useToggleChatPanel }
