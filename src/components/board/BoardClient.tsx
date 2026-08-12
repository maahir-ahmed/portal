"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { cn, formatDate } from "@/lib/utils";

export type Lane = "TODO" | "DOING" | "DONE";

export interface BoardCard {
  id: string;
  lane: Lane;
  title: string;
  notes: string | null;
  dueDate: string | null;
  authorName: string;
  authorAvatar: string | null;
}

const LANES: { id: Lane; label: string }[] = [
  { id: "TODO", label: "To do" },
  { id: "DOING", label: "In progress" },
  { id: "DONE", label: "Done" },
];

// Whether a due date wants attention: red once it's past, amber inside a week.
function dueTone(due: string | null, lane: Lane): string {
  if (!due || lane === "DONE") return "text-muted-foreground";
  const days = (new Date(due).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return "text-red-600 font-medium";
  if (days < 7) return "text-amber-600 font-medium";
  return "text-muted-foreground";
}

// ponytail: no realtime and no intra-column ordering. Cards move between columns
// and sort by due date; a second exec's edits show on reload. Both are only worth
// building if the board outgrows one committee.
export function BoardClient({
  societySlug,
  initialCards,
}: {
  societySlug: string;
  initialCards: BoardCard[];
}) {
  const [cards, setCards] = useState(initialCards);
  const [addingTo, setAddingTo] = useState<Lane | null>(null);
  const [editing, setEditing] = useState<BoardCard | null>(null);
  const [busy, setBusy] = useState(false);

  const base = `/api/societies/${societySlug}/board`;

  async function send(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error ?? "Request failed");
    }
    return res.json();
  }

  async function move(id: string, lane: Lane) {
    const before = cards;
    const card = cards.find((c) => c.id === id);
    if (!card || card.lane === lane) return;
    // Move it locally first: a card that hangs in the old column for a round trip
    // reads as a failed drag, and the revert below covers the request failing.
    setCards(cards.map((c) => (c.id === id ? { ...c, lane } : c)));
    try {
      await send(`${base}/${id}`, "PATCH", { lane });
    } catch (err) {
      setCards(before);
      toast.error(err instanceof Error ? err.message : "Failed to move card");
    }
  }

  async function add(e: React.FormEvent<HTMLFormElement>, lane: Lane) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    if (!title) return;
    setBusy(true);
    try {
      const created = await send(base, "POST", {
        title,
        dueDate: String(form.get("dueDate") ?? "") || null,
        lane,
      });
      setCards([
        ...cards,
        {
          id: created.id,
          lane,
          title,
          notes: null,
          dueDate: created.dueDate,
          authorName: created.createdBy.name,
          authorAvatar: created.createdBy.avatarUrl,
        },
      ]);
      setAddingTo(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add card");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const form = new FormData(e.currentTarget);
    const patch = {
      title: String(form.get("title") ?? "").trim(),
      notes: String(form.get("notes") ?? "").trim() || null,
      dueDate: String(form.get("dueDate") ?? "") || null,
    };
    if (!patch.title) return;
    setBusy(true);
    try {
      await send(`${base}/${editing.id}`, "PATCH", patch);
      setCards(cards.map((c) => (c.id === editing.id ? { ...c, ...patch, dueDate: patch.dueDate } : c)));
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save card");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this card?")) return;
    setBusy(true);
    try {
      await send(`${base}/${id}`, "DELETE");
      setCards(cards.filter((c) => c.id !== id));
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete card");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {LANES.map((lane) => {
          const laneCards = cards.filter((c) => c.lane === lane.id);
          return (
            <div
              key={lane.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                move(e.dataTransfer.getData("text/plain"), lane.id);
              }}
              className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3"
            >
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold">{lane.label}</h2>
                <span className="text-xs text-muted-foreground tabnums">{laneCards.length}</span>
              </div>

              {laneCards.map((card) => (
                <div
                  key={card.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", card.id)}
                  onClick={() => setEditing(card)}
                  className="cursor-grab rounded-lg border bg-card p-3 text-left shadow-sm transition-shadow hover:shadow active:cursor-grabbing"
                >
                  <p className={cn("text-sm", lane.id === "DONE" && "text-muted-foreground line-through")}>
                    {card.title}
                  </p>
                  {card.notes && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{card.notes}</p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className={cn("text-xs", dueTone(card.dueDate, card.lane))}>
                      {card.dueDate ? formatDate(card.dueDate) : ""}
                    </span>
                    <UserAvatar name={card.authorName} avatarUrl={card.authorAvatar} size="sm" />
                  </div>
                </div>
              ))}

              {addingTo === lane.id ? (
                <form onSubmit={(e) => add(e, lane.id)} className="space-y-2 rounded-lg border bg-card p-2">
                  <Input name="title" placeholder="What needs doing?" autoFocus required maxLength={200} />
                  <Input name="dueDate" type="date" aria-label="Due date" />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={busy}>Add</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAddingTo(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setAddingTo(lane.id)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" /> Add card
                </button>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setEditing(null)}
        >
          <form
            onSubmit={saveEdit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3 rounded-lg border bg-card p-4 shadow-lg"
          >
            <Input name="title" defaultValue={editing.title} required maxLength={200} aria-label="Title" />
            <Textarea name="notes" defaultValue={editing.notes ?? ""} rows={4} placeholder="Notes" maxLength={2000} />
            <Input
              name="dueDate"
              type="date"
              defaultValue={editing.dueDate ? editing.dueDate.slice(0, 10) : ""}
              aria-label="Due date"
            />
            <p className="text-xs text-muted-foreground">Added by {editing.authorName}</p>
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-red-600 hover:text-red-700"
                onClick={() => remove(editing.id)}
                disabled={busy}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
              </Button>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={busy}>Save</Button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
