"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Input, fieldClasses } from "@/components/ui/input";

// 00:00 … 23:45 in quarter-hour steps. A native <select> gives a pickable list of
// valid times; type="time" only ever offers a free-scrolling spinner.
export const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    value: `${pad(h)}:${pad(m)}`,
    label: `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? "AM" : "PM"}`,
  };
});

export function TimeSelect({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const current = (props.value ?? props.defaultValue) as string | undefined;
  // A record saved before the 15-minute grid (or by another client) keeps its own
  // option, so editing an unrelated field can't silently round the time.
  const options =
    current && !TIME_OPTIONS.some((o) => o.value === current)
      ? [{ value: current, label: current }, ...TIME_OPTIONS]
      : TIME_OPTIONS;

  return (
    <select className={cn(fieldClasses, className)} {...props}>
      <option value="">--:--</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

interface DateTimeFieldProps {
  name?: string;
  id?: string;
  /** "yyyy-MM-ddTHH:mm", same shape <input type="datetime-local"> takes. */
  defaultValue?: string;
  required?: boolean;
  onChange?: (value: string) => void;
}

/**
 * Replaces <input type="datetime-local">: a date picker plus a 15-minute time list.
 * The combined value is mirrored into a hidden input, so forms reading FormData by
 * `name` keep working unchanged.
 */
export function DateTimeField({ name, id, defaultValue = "", required, onChange }: DateTimeFieldProps) {
  const [date, setDate] = React.useState(defaultValue.slice(0, 10));
  const [time, setTime] = React.useState(defaultValue.slice(11, 16));

  const update = (d: string, t: string) => {
    setDate(d);
    setTime(t);
    onChange?.(d && t ? `${d}T${t}` : "");
  };

  return (
    <div className="flex gap-2">
      <Input
        id={id}
        type="date"
        value={date}
        onChange={(e) => update(e.target.value, time)}
        required={required}
        className="min-w-0 flex-1"
      />
      <TimeSelect
        value={time}
        onChange={(e) => update(date, e.target.value)}
        required={required}
        className="w-28 flex-shrink-0 sm:w-32"
      />
      {name && <input type="hidden" name={name} value={date && time ? `${date}T${time}` : ""} />}
    </div>
  );
}
