import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// While a restore replaces the database, every other request gets the maintenance
// page instead of a half-restored site. The flag is a file, because the proxy and the
// route handler that sets it are separate module instances. It holds this process's
// start time, so a flag left behind by a process that died mid-restore is ignored by
// the next one instead of keeping the site down for good.
const FLAG = join(tmpdir(), "society-portal-maintenance");
const BOOT = String(performance.timeOrigin);

export function setMaintenance(on: boolean) {
  if (on) writeFileSync(FLAG, BOOT);
  else rmSync(FLAG, { force: true });
}

export function maintenanceActive(): boolean {
  if (!existsSync(FLAG)) return false;
  try {
    return readFileSync(FLAG, "utf8") === BOOT;
  } catch {
    return false;
  }
}

let page: string | null = null;

/** The same page nginx shows while the app restarts (deploy/maintenance.html). */
export function maintenancePage(): string {
  if (page === null) {
    try {
      page = readFileSync(join(process.cwd(), "deploy", "maintenance.html"), "utf8");
    } catch {
      page = "<!doctype html><title>Back soon</title><p>The portal is being restored. Try again in a minute.</p>";
    }
  }
  return page;
}
