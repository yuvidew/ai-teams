"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"

import { createGroupChat } from "@/actions/group-chat"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { useUpgradeToast } from "@/components/upgrade-toast"
import { insertGroupChatSchema, type InsertGroupChat } from "@/db/schema"
import type { PickableBot } from "@/queries/bots"

type GroupChatDialogProps = {
  bots: PickableBot[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

function GroupChatDialog({ bots, open, onOpenChange }: GroupChatDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = React.useTransition()

  const form = useForm<InsertGroupChat>({
    resolver: zodResolver(insertGroupChatSchema),
    defaultValues: { name: "", botIds: [] },
  })

  // Fresh values every time the dialog opens.
  const { reset } = form
  React.useEffect(() => {
    if (open) reset({ name: "", botIds: [] })
  }, [open, reset])

  const showUpgrade = useUpgradeToast()

  function onSubmit(values: InsertGroupChat) {
    startTransition(async () => {
      try {
        const result = await createGroupChat(values)

        if (!result.success) {
          if ("upgrade" in result) {
            showUpgrade(result.error)
            return
          }
          form.setError("root", { message: result.error })
          toast.add({
            type: "error",
            title: "Couldn't create group chat",
            description: result.error,
          })
          return
        }

        toast.add({
          type: "success",
          title: "Group chat created",
          description: `${values.name.trim()} is ready to go.`,
        })
        onOpenChange(false)
        router.push(`/chats/${result.id}`)
        router.refresh()
      } catch {
        toast.add({
          type: "error",
          title: "Couldn't create group chat",
          description: "Something went wrong. Please try again.",
        })
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          id="group-chat-form"
          onSubmit={form.handleSubmit(onSubmit)}
          className="contents"
        >
          <DialogHeader>
            <DialogTitle>New group chat</DialogTitle>
            <DialogDescription>
              Name the group and pick which bots are in it.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="group-chat-name">Name</FieldLabel>
                  <Input
                    {...field}
                    id="group-chat-name"
                    placeholder="Weekend plans"
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
              name="botIds"
              control={form.control}
              render={({ field, fieldState }) => (
                <FieldSet data-invalid={fieldState.invalid}>
                  <FieldLegend variant="label">Bots</FieldLegend>
                  <FieldGroup data-slot="checkbox-group" className="gap-3">
                    {bots.map((bot) => (
                      <Field
                        key={bot.id}
                        orientation="horizontal"
                        data-invalid={fieldState.invalid}
                      >
                        <Checkbox
                          id={`group-chat-bot-${bot.id}`}
                          aria-invalid={fieldState.invalid}
                          checked={field.value.includes(bot.id)}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked
                                ? [...field.value, bot.id]
                                : field.value.filter((id) => id !== bot.id)
                            )
                          }
                        />
                        <FieldLabel
                          htmlFor={`group-chat-bot-${bot.id}`}
                          className="font-normal"
                        >
                          <ChatAvatar seed={bot.avatar} className="size-5" />
                          {bot.name}
                        </FieldLabel>
                      </Field>
                    ))}
                  </FieldGroup>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </FieldSet>
              )}
            />
            {form.formState.errors.root && (
              <FieldError errors={[form.formState.errors.root]} />
            )}
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              Create group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { GroupChatDialog }
