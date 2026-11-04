"use client";

import { EmailSettings } from "@/components/settings/EmailSettings";

// The same form as Settings > Email. Optional: Continue skips it.
export function EmailStep({ societySlug }: { societySlug: string }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        With email, new members get their sign-in details in their inbox. Without it, the portal shows them to you and you
        pass them on. You can skip this and set it up later in Settings › Email.
      </p>
      <EmailSettings societySlug={societySlug} />
    </div>
  );
}
