"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Pencil, Trash2, Plus, Check, X } from "lucide-react";

interface SocietyTitle {
  id: string;
  name: string;
  roleLevel: "EXECUTIVE" | "DIRECTOR" | "SUBCOMMITTEE";
  sortOrder: number;
  portfolio: { id: string; name: string } | null;
}

interface Portfolio { id: string; name: string }

const NO_PORTFOLIO = "__none__";
const SELECT_CLASS =
  "h-7 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const ROLE_LABELS: Record<string, string> = {
  EXECUTIVE: "Executive",
  DIRECTOR: "Director",
  SUBCOMMITTEE: "Subcommittee",
};

const ROLE_COLORS: Record<string, string> = {
  EXECUTIVE: "bg-blue-50 border-blue-200",
  DIRECTOR: "bg-purple-50 border-purple-200",
  SUBCOMMITTEE: "bg-gray-50 border-gray-200",
};

export function TitlesManager({ societySlug }: { societySlug: string }) {
  const [titles, setTitles] = useState<SocietyTitle[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [newPortfolioId, setNewPortfolioId] = useState(NO_PORTFOLIO);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [addingRole, setAddingRole] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const [titleRes, portfolioRes] = await Promise.all([
      fetch(`/api/societies/${societySlug}/titles`),
      fetch(`/api/societies/${societySlug}/portfolios`),
    ]);
    if (titleRes.ok) setTitles(await titleRes.json());
    if (portfolioRes.ok) setPortfolios(await portfolioRes.json());
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- load-on-mount; re-runs only when the society changes
  useEffect(() => { load(); }, [societySlug]);

  async function handleAdd(roleLevel: string) {
    if (!newTitle.trim()) return;
    setLoading(true);
    const res = await fetch(`/api/societies/${societySlug}/titles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newTitle.trim(),
        roleLevel,
        portfolioId: newPortfolioId === NO_PORTFOLIO ? null : newPortfolioId,
      }),
    });
    setLoading(false);
    if (res.ok) {
      toast.success("Title added");
      setNewTitle("");
      setNewPortfolioId(NO_PORTFOLIO);
      setAddingRole(null);
      load();
    } else {
      const d = await res.json();
      toast.error(d.error ?? "Failed to add title");
    }
  }

  async function handleRename(id: string) {
    if (!editValue.trim()) return;
    setLoading(true);
    const res = await fetch(`/api/societies/${societySlug}/titles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editValue.trim() }),
    });
    setLoading(false);
    if (res.ok) {
      toast.success("Title renamed");
      setEditingId(null);
      load();
    } else {
      toast.error("Failed to rename");
    }
  }

  async function setPortfolio(id: string, value: string) {
    setLoading(true);
    const res = await fetch(`/api/societies/${societySlug}/titles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolioId: value === NO_PORTFOLIO ? null : value }),
    });
    setLoading(false);
    if (res.ok) {
      toast.success("Portfolio updated, members holding this title moved with it");
      load();
    } else {
      toast.error("Failed to set portfolio");
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete title "${name}"?`)) return;
    const res = await fetch(`/api/societies/${societySlug}/titles/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Title removed");
      load();
    } else {
      toast.error("Failed to delete");
    }
  }

  const byRole = (role: string) => titles.filter((t) => t.roleLevel === role);

  return (
    <Card data-tour="settings-titles">
      <CardHeader>
        <CardTitle className="text-base">Roles &amp; Titles</CardTitle>
        <CardDescription>
          The title options shown when adding or editing a member. A director or subcom title also
          decides which portfolio its holder is grouped into on the Members page. Executive titles
          have no portfolio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {(["EXECUTIVE", "DIRECTOR", "SUBCOMMITTEE"] as const).map((role) => (
          <div key={role} className={`rounded-lg border p-4 space-y-3 ${ROLE_COLORS[role]}`}>
            <p className="text-sm font-semibold">{ROLE_LABELS[role]}</p>
            <div className="space-y-1.5">
              {byRole(role).map((t) => (
                <div key={t.id} className="flex items-center gap-2">
                  {editingId === t.id ? (
                    <>
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(t.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="h-7 text-sm flex-1"
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => handleRename(t.id)} disabled={loading}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400" onClick={() => setEditingId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm flex-1 bg-white/60 rounded px-2 py-1">{t.name}</span>
                      {role !== "EXECUTIVE" && (
                        <select
                          value={t.portfolio?.id ?? NO_PORTFOLIO}
                          onChange={(e) => setPortfolio(t.id, e.target.value)}
                          disabled={loading || portfolios.length === 0}
                          className={SELECT_CLASS}
                          title="Portfolio this title puts a member in"
                        >
                          <option value={NO_PORTFOLIO}>(no portfolio)</option>
                          {portfolios.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      )}
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => { setEditingId(t.id); setEditValue(t.name); }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600"
                        onClick={() => handleDelete(t.id, t.name)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>

            {addingRole === role ? (
              <div className="flex gap-2 pt-1">
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd(role);
                    if (e.key === "Escape") { setAddingRole(null); setNewTitle(""); }
                  }}
                  placeholder="Title name…"
                  className="h-7 text-sm"
                  autoFocus
                />
                {role !== "EXECUTIVE" && portfolios.length > 0 && (
                  <select
                    value={newPortfolioId}
                    onChange={(e) => setNewPortfolioId(e.target.value)}
                    className={SELECT_CLASS}
                  >
                    <option value={NO_PORTFOLIO}>(no portfolio)</option>
                    {portfolios.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
                <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleAdd(role)} disabled={loading || !newTitle.trim()}>
                  Add
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setAddingRole(null); setNewTitle(""); }}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => { setAddingRole(role); setNewTitle(""); setNewPortfolioId(NO_PORTFOLIO); }}
              >
                <Plus className="h-3 w-3 mr-1" /> Add title
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
