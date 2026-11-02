import { redirect } from "next/navigation";

export default async function SettingsIndex({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  redirect(`/${society}/settings/general`);
}
