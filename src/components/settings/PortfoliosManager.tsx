"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { BASE_PORTFOLIOS } from "@/lib/portfolios";

interface Portfolio {
  id: string;
  name: string;
  memberCount: number;
  titleCount: number;
}

export function PortfoliosManager({ societySlug }: { societySlug: string }) {
  const base = `/api/societies/${societySlug}/portfolios`;
  const [portfolios, setPortfolios] = useState<Portfolio[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(base);
    if (res.ok) setPortfolios(await res.json());
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- load-on-mount; re-runs only when the society changes
  useEffect(() => { load(); }, [societySlug]);

  async function send(url: string, init: RequestInit, failure: string) {
    setBusy(true);
    const res = await fetch(url, init);
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? failure);
      return false;
    }
    await load();
    return true;
  }

  async function add() {
    if (!newName.trim()) return;
    const ok = await send(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    }, "Could not add portfolio");
    if (ok) {
      toast.success("Portfolio added");
      setNewName("");
      setAdding(false);
    }
  }

  async function addDefaults() {
    const ok = await send(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaults: true }),
    }, "Could not add the default portfolios");
    if (ok) toast.success("Default portfolios added");
  }

  async function rename(id: string) {
    if (!editValue.trim()) return;
    const ok = await send(`${base}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editValue.trim() }),
    }, "Could not rename portfolio");
    if (ok) {
      toast.success("Portfolio renamed");
      setEditingId(null);
    }
  }

  async function remove(p: Portfolio) {
    const warning = p.memberCount > 0 || p.titleCount > 0
      ? `Delete "${p.name}"? ${p.memberCount} member${p.memberCount === 1 ? "" : "s"} and ${p.titleCount} title${p.titleCount === 1 ? "" : "s"} will be left unassigned.`
      : `Delete "${p.name}"?`;
    if (!confirm(warning)) return;
    if (await send(`${base}/${p.id}`, { method: "DELETE" }, "Could not delete portfolio")) {
      toast.success("Portfolio removed");
    }
  }

  return (
    <Card data-tour="settings-portfolios">
      <CardHeader>
        <CardTitle className="text-base">Portfolios</CardTitle>
        <CardDescription>
          The areas the committee is split into. A member is grouped by the title they hold, so each
          portfolio needs a director title and a subcom title in Roles &amp; Titles below. Executives
          are grouped by role and hold no portfolio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {portfolios === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : portfolios.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              No portfolios yet, so everyone outside the executive team shows under &quot;No
              portfolio&quot;.
            </p>
            <Button size="sm" onClick={addDefaults} disabled={busy} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add the {BASE_PORTFOLIOS.length} committee portfolios
            </Button>
            <p className="text-xs text-muted-foreground">
              {BASE_PORTFOLIOS.map((p) => p.name).join(", ")}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {portfolios.map((p) => {
              return (
                <div key={p.id} className="flex items-center gap-2">
                  {editingId === p.id ? (
                    <>
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") rename(p.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="h-7 text-sm flex-1"
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => rename(p.id)} disabled={busy}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => setEditingId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 rounded bg-muted/50 px-2 py-1 text-sm">{p.name}</span>
                      <span className="tabnums text-xs text-muted-foreground">
                        {p.memberCount} member{p.memberCount === 1 ? "" : "s"} · {p.titleCount} title
                        {p.titleCount === 1 ? "" : "s"}
                      </span>
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        title="Rename"
                        onClick={() => { setEditingId(p.id); setEditValue(p.name); }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600"
                        title="Delete"
                        onClick={() => remove(p)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {portfolios !== null && portfolios.length > 0 && (
          adding ? (
            <div className="flex gap-2 pt-1">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") add();
                  if (e.key === "Escape") { setAdding(false); setNewName(""); }
                }}
                placeholder="Portfolio name…"
                className="h-7 text-sm"
                autoFocus
              />
              <Button size="sm" className="h-7 px-2 text-xs" onClick={add} disabled={busy || !newName.trim()}>Add</Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setAdding(false); setNewName(""); }}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAdding(true); setNewName(""); }}>
              <Plus className="h-3 w-3 mr-1" /> Add portfolio
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}
