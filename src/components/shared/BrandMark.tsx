import type { Brand } from "@/lib/branding";

// Pure, so the client login form can use it without pulling lib/branding's database
// code into the browser bundle (the Brand import above is type-only).
function initials(name: string): string {
  const words = name.replace(/^UNSW\s+/i, "").split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "S";
}

/** The society's logo tile on pages shown before sign-in, or its initials when it has no public logo. */
export function BrandMark({ brand }: { brand: Brand }) {
  return (
    <div className="h-14 w-14 rounded-2xl bg-[#0b0b0d] flex items-center justify-center p-2.5 ring-1 ring-black/5">
      {brand.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logo} alt={brand.name} className="h-full w-full object-contain" />
      ) : (
        <span className="text-lg font-semibold tracking-tight text-white">{initials(brand.name)}</span>
      )}
    </div>
  );
}
