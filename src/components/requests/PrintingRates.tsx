import { cn } from "@/lib/utils";
import { PRINT_RATES, type Colour, type PaperSize, type Sided } from "@/lib/printing";

// Per-page price list, read straight from PRINT_RATES so the table can't drift from
// what the cost is actually calculated with. Pass `selected` on the request form to
// pick out the row and cell the current options land on.
const ROWS: { size: PaperSize; dim: "single" | "double"; label: string }[] = [
  { size: "A4", dim: "single", label: "A4, single sided" },
  { size: "A4", dim: "double", label: "A4, double sided" },
  { size: "A3", dim: "single", label: "A3, single sided" },
  { size: "A3", dim: "double", label: "A3, double sided" },
];

const COLOURS: { key: Colour; label: string }[] = [
  { key: "BW", label: "Black & white" },
  { key: "COLOUR", label: "Colour" },
];

export function PrintingRates({
  selected,
}: {
  selected?: { paperSize: PaperSize; sided: Sided; colour: Colour };
}) {
  const selectedDim = selected && (selected.sided === "SINGLE" ? "single" : "double");

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Cost per page</th>
            {COLOURS.map((c) => (
              <th key={c.key} className="px-3 py-2 text-right font-medium">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(({ size, dim, label }) => {
            const rowSelected = selected?.paperSize === size && selectedDim === dim;
            return (
              <tr key={label} className={cn("border-t", rowSelected && "bg-accent/60")}>
                <td className={cn("px-3 py-1.5", rowSelected && "font-medium")}>{label}</td>
                {COLOURS.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-3 py-1.5 text-right tabnums",
                      rowSelected && selected?.colour === c.key ? "font-semibold text-foreground" : "text-muted-foreground"
                    )}
                  >
                    ${PRINT_RATES[size][dim][c.key].toFixed(2)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
        Total = rate x pages per copy x number of copies. Double sided costs the same whichever
        edge it flips on.
      </p>
    </div>
  );
}
