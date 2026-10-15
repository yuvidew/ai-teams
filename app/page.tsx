import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs"

import { Button } from "@/components/ui/button"

export default function Page() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-end gap-2 p-4">
        <Show when="signed-out">
          <SignInButton>
            <Button variant="ghost">Sign in</Button>
          </SignInButton>
          <SignUpButton>
            <Button>Sign up</Button>
          </SignUpButton>
        </Show>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </header>
      <div className="flex flex-1 p-6">
        <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
          <div>
            <h1 className="font-medium">Project ready!</h1>
            <p>You may now add components and start building.</p>
            <p>We&apos;ve already added the button component for you.</p>
            <Button className="mt-2">Button</Button>
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            (Press <kbd>d</kbd> to toggle dark mode)
          </div>
        </div>
      </div>
    </div>
  )
}
