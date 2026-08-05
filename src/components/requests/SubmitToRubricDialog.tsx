"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimeField } from "@/components/ui/datetime";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Upload, ExternalLink, Loader2, ArrowLeft, ArrowRight } from "lucide-react";
import { useRubricClient } from "@/hooks/useRubricClient";
import { RubricFormQuestions } from "@/components/requests/RubricFormQuestions";
import { buildQuestionsPayload, validateAnswers } from "@/lib/rubricForm";
import type { RubricEventForm, RubricAnswers, RubricFormQuestion } from "@/types/rubric";

interface SubmitToRubricDialogProps {
  societySlug: string;
  contentRequestId?: string;
  defaultEventName: string;
  defaultDescription: string;
  defaultAddress: string;
  defaultStartDate: Date;
  defaultEndDate?: Date | null;
  alreadySubmitted?: Date | null;
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Rubric expects "YYYY-MM-DD HH:MM:SS" wall-clock time (paired with the timezone field).
function toRubricDate(datetimeLocal: string): string {
  return datetimeLocal.replace("T", " ") + (datetimeLocal.length === 16 ? ":00" : "");
}

// getSocietyEventCreatePage may return the affiliation form under a few possible keys.
// Pull whichever holds { form_id, questions }.
function extractForm(data: Record<string, unknown>): RubricEventForm | null {
  const candidates = [data.form, data.eventForm, data.affiliationForm, data.metaForm, data];
  for (const c of candidates) {
    const obj = c as Record<string, unknown> | undefined;
    if (!obj || !Array.isArray(obj.questions)) continue;
    const formId = obj.form_id ?? obj.formId ?? obj.formid;
    if (formId != null) {
      return { form_id: Number(formId), questions: obj.questions as RubricFormQuestion[] };
    }
  }
  return null;
}

export function SubmitToRubricDialog({
  societySlug,
  contentRequestId,
  defaultEventName,
  defaultDescription,
  defaultAddress,
  defaultStartDate,
  defaultEndDate,
  alreadySubmitted,
}: SubmitToRubricDialogProps) {
  const router = useRouter();
  const rubric = useRubricClient(societySlug);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);

  // Affiliation form (fetched lazily when the dialog opens)
  const [form, setForm] = useState<RubricEventForm | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<RubricAnswers>({});

  const [eventName, setEventName] = useState(defaultEventName);
  const [description, setDescription] = useState(defaultDescription);
  const [address, setAddress] = useState(defaultAddress);
  const [startDate, setStartDate] = useState(toDatetimeLocal(defaultStartDate));
  const [endDate, setEndDate] = useState(defaultEndDate ? toDatetimeLocal(defaultEndDate) : "");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isDraft, setIsDraft] = useState(false);
  const [totalTickets, setTotalTickets] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");

  async function loadForm() {
    setFormLoading(true);
    setFormError(null);
    try {
      const data = await rubric.call({ type: "getSocietyEventCreatePage" });
      const f = extractForm(data);
      if (!f) {
        setFormError("Could not load the Arc event form. You can still publish, but it may be rejected.");
      } else {
        setForm(f);
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to load event form");
    } finally {
      setFormLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && !form && !formLoading) loadForm();
    if (!next) setStep(1);
  }

  function goToStep2() {
    if (!eventName.trim()) { toast.error("Event name is required"); return; }
    if (!endDate) { toast.error("End date is required"); return; }
    setStep(2);
  }

  async function handleSubmit() {
    if (form) {
      const validationError = validateAnswers(form, answers);
      if (validationError) { toast.error(validationError); return; }
    }

    setSubmitting(true);
    try {
      // We generate the UUID that links the affiliation form to the event.
      const metaFormResponseUUID = form ? crypto.randomUUID() : null;

      // Step 1: submit the Arc affiliation form under that UUID
      if (form && metaFormResponseUUID) {
        await rubric.call({
          type: "submitFormResponse",
          form_id: form.form_id,
          draft: false,
          questions: buildQuestionsPayload(form, answers),
          metaFormResponseUUID,
        });
      }

      // Step 2: submit the event, attaching the affiliation form response
      const res = await rubric.call({
        type: "submitEvent",
        eventName,
        description,
        eventAddress: address,
        eventStartDate: toRubricDate(startDate),
        eventEndDate: toRubricDate(endDate),
        timezone: "Australia/Sydney",
        isPrivate,
        draft: isDraft,
        ...(metaFormResponseUUID ? { metaFormResponseUUID } : {}),
        ...(totalTickets ? { totalTickets } : {}),
        ...(bannerUrl ? { bannerurl: bannerUrl } : {}),
        ...(facebookUrl ? { facebookURL: facebookUrl } : {}),
      });

      const eventDetails = res.eventDetails as Record<string, unknown> | undefined;
      const rubricEventId = eventDetails?.eventId != null ? String(eventDetails.eventId) : undefined;
      const rubricEventLink = eventDetails?.eventURL as string | undefined;

      // Record on our DB
      await fetch(`/api/societies/${societySlug}/rubric/submit-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(contentRequestId ? { contentRequestId } : {}), rubricEventId, rubricEventLink }),
      });

      toast.success(
        isDraft
          ? "Event saved as draft on Rubric"
          : rubricEventLink
            ? `Event published! ${rubricEventLink}`
            : "Event submitted to Rubric!",
        { duration: 8000 }
      );
      setOpen(false);
      setStep(1);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to submit to Rubric");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant={alreadySubmitted ? "outline" : "default"} className="gap-2">
          <Upload className="h-3.5 w-3.5" />
          {alreadySubmitted ? "Re-submit to Rubric" : "Submit to Rubric"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Submit Event to Rubric {form ? `· Step ${step} of 2` : ""}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Event details that will appear on the Rubric student portal."
              : "Arc affiliation questions, required by your union before the event can be published."}
          </DialogDescription>
        </DialogHeader>

        {alreadySubmitted && step === 1 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            Previously submitted on {alreadySubmitted.toLocaleDateString()}. Submitting again will create a new event on Rubric.
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label>Event Name *</Label>
              <Input value={eventName} onChange={(e) => setEventName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Describe the event for students..."
              />
            </div>
            <div className="space-y-2">
              <Label>Venue / Address *</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date & Time *</Label>
                <DateTimeField defaultValue={startDate} onChange={setStartDate} />
              </div>
              <div className="space-y-2">
                <Label>End Date & Time *</Label>
                <DateTimeField defaultValue={endDate} onChange={setEndDate} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Total Tickets (leave blank for unlimited)</Label>
              <Input
                type="number"
                value={totalTickets}
                onChange={(e) => setTotalTickets(e.target.value)}
                placeholder="e.g. 200"
                min="1"
              />
            </div>
            <div className="space-y-2">
              <Label>Banner Image URL</Label>
              <Input value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="https://..." type="url" />
            </div>
            <div className="space-y-2">
              <Label>Facebook Event URL</Label>
              <Input value={facebookUrl} onChange={(e) => setFacebookUrl(e.target.value)} placeholder="https://facebook.com/events/..." type="url" />
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                Private event
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={isDraft} onChange={(e) => setIsDraft(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                Save as draft (don&apos;t publish yet)
              </label>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="py-1">
            {formLoading ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : formError ? (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">{formError}</div>
            ) : form ? (
              <RubricFormQuestions form={form} answers={answers} onChange={setAnswers} />
            ) : (
              <p className="text-sm text-muted-foreground">No affiliation form required.</p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              {form || formLoading ? (
                <Button onClick={goToStep2} disabled={formLoading} className="gap-1">
                  Next: Affiliation Form <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : "Publish to Rubric"}
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)} className="gap-1">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</>
                ) : isDraft ? (
                  "Save Draft on Rubric"
                ) : (
                  <><ExternalLink className="h-4 w-4 mr-2" /> Publish to Rubric</>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
