"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { ShuffleIcon, Trash2Icon } from "lucide-react"
import { nanoid } from "nanoid"
import { useRouter } from "next/navigation"
import { Controller, useForm, useWatch } from "react-hook-form"
import type { z } from "zod"

import { createBot, deleteBot, updateBot } from "@/actions/bot"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { insertBotSchema } from "@/db/schema"

const PRESETS = [
  {
    job: "Research assistant",
    name: "Ada",
    instructions:
      "Answer briefly, cite sources, and ask before running anything destructive.",
  },
  {
    job: "Code reviewer",
    name: "Linus",
    instructions:
      "Review changes for bugs and readability, explain the why behind each comment, and suggest a fix.",
  },
  {
    job: "Writing editor",
    name: "Maya",
    instructions:
      "Tighten prose, keep my voice, and point out unclear or repetitive sentences instead of rewriting everything.",
  },
  {
    job: "Tutor",
    name: "Sage",
    instructions:
      "Explain step by step, check my understanding with a question, and never just hand over the answer.",
  },
]

type FormValues = z.input<typeof insertBotSchema>

type EditableBot = {
  id: string
  name: string
  job: string
  instructions: string | null
  avatar: string
}

type BotDialogProps = {
  // Pass a bot to edit it instead of creating a new one.
  bot?: EditableBot
  // Optional trigger. Omit it and drive the dialog with `open` instead.
  children?: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function BotDialog({
  bot,
  children,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: BotDialogProps) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = openProp ?? internalOpen
  const setOpen = React.useCallback(
    (next: boolean) => {
      setInternalOpen(next)
      onOpenChangeProp?.(next)
    },
    [onOpenChangeProp]
  )
  const [isPending, startTransition] = React.useTransition()
  const [isDeleting, startDeleting] = React.useTransition()
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(insertBotSchema),
    defaultValues: { name: "", job: "", instructions: "", avatar: "" },
  })

  // Fresh values every time the dialog opens, however it was opened.
  const { reset } = form
  const botId = bot?.id
  const botName = bot?.name
  const botJob = bot?.job
  const botInstructions = bot?.instructions
  const botAvatar = bot?.avatar
  React.useEffect(() => {
    if (!open) return

    if (botId) {
      reset({
        name: botName,
        job: botJob,
        instructions: botInstructions ?? "",
        avatar: botAvatar,
      })
    } else {
      reset({ name: "", job: "", instructions: "", avatar: nanoid() })
    }
  }, [open, reset, botId, botName, botJob, botInstructions, botAvatar])

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      try {
        const result = botId
          ? await updateBot(botId, values)
          : await createBot(values)

        if (!result.success) {
          form.setError("root", { message: result.error })
          toast.add({
            type: "error",
            title: botId ? "Couldn't save bot" : "Couldn't create bot",
            description: result.error,
          })
          return
        }

        toast.add({
          type: "success",
          title: botId ? "Bot updated" : "Bot created",
          description: botId
            ? `${values.name.trim()} was saved.`
            : `${values.name.trim()} is ready to go.`,
        })
        setOpen(false)
        router.refresh()
      } catch {
        toast.add({
          type: "error",
          title: botId ? "Couldn't save bot" : "Couldn't create bot",
          description: "Something went wrong. Please try again.",
        })
      }
    })
  }

  function onDelete() {
    if (!botId) return

    startDeleting(async () => {
      try {
        const result = await deleteBot(botId)

        if (!result.success) {
          toast.add({
            type: "error",
            title: "Couldn't delete bot",
            description: result.error,
          })
          return
        }

        toast.add({
          type: "success",
          title: "Bot deleted",
          description: `${botName} and its chat were removed.`,
        })
        setConfirmOpen(false)
        setOpen(false)
        // The chat page no longer exists, so leave it.
        router.push("/")
        router.refresh()
      } catch {
        toast.add({
          type: "error",
          title: "Couldn't delete bot",
          description: "Something went wrong. Please try again.",
        })
      }
    })
  }

  const avatar = useWatch({ control: form.control, name: "avatar" }) ?? ""
  const job = useWatch({ control: form.control, name: "job" }) ?? ""

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger render={children} />}
      <DialogContent className="sm:max-w-md">
        <form
          id="bot-form"
          onSubmit={form.handleSubmit(onSubmit)}
          className="contents"
        >
          <DialogHeader>
            <DialogTitle>{botId ? "Edit bot" : "New bot"}</DialogTitle>
            <DialogDescription>
              Give it a face, a name, and a job to do.
            </DialogDescription>
          </DialogHeader>

          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={2}
            className="flex-wrap"
            value={PRESETS.some((preset) => preset.job === job) ? [job] : []}
            onValueChange={(value) => {
              const preset = PRESETS.find((item) => item.job === value[0])
              if (!preset) return

              const options = { shouldValidate: true, shouldDirty: true }
              form.setValue("job", preset.job, options)
              form.setValue("name", preset.name, options)
              form.setValue("instructions", preset.instructions, options)
            }}
          >
            {PRESETS.map((preset) => (
              <ToggleGroupItem
                key={preset.job}
                value={preset.job}
                className="rounded-full"
              >
                {preset.job}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <div className="flex items-center gap-3">
            {avatar ? (
              <ChatAvatar seed={avatar} animated className="size-10" />
            ) : (
              <div className="size-10 shrink-0" />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium">Face</span>
              <span className="text-muted-foreground">
                Shuffle until you find one you like.
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => form.setValue("avatar", nanoid())}
            >
              <ShuffleIcon data-icon="inline-start" />
              Shuffle
            </Button>
          </div>

          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="bot-name">Name</FieldLabel>
                  <Input
                    {...field}
                    id="bot-name"
                    placeholder="Ada"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="job"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="bot-job">Job</FieldLabel>
                  <Input
                    {...field}
                    id="bot-job"
                    placeholder="Research assistant"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="instructions"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="bot-instructions">
                    How it should work
                  </FieldLabel>
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    id="bot-instructions"
                    rows={9}
                    placeholder="Answer briefly, cite sources, and ask before running anything destructive."
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            {form.formState.errors.root && (
              <FieldError errors={[form.formState.errors.root]} />
            )}
          </FieldGroup>

          <DialogFooter>
            {botId && (
              <Button
                type="button"
                variant="destructive"
                className="sm:mr-auto"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2Icon data-icon="inline-start" />
                Delete
              </Button>
            )}
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {botId ? "Save changes" : "Create bot"}
            </Button>
          </DialogFooter>
        </form>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {botName}?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes the bot and its chat. This can&apos;t
                be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={isDeleting}
                onClick={onDelete}
              >
                Delete bot
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}

export { BotDialog }
