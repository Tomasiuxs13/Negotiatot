import PageHeader from "@/components/PageHeader";
import PlaybookEditor from "@/components/playbook/PlaybookEditor";
import { getPlaybook, getSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function PlaybookPage() {
  const initial = {
    platforms: {
      youtube: getPlaybook("youtube") ?? {},
      instagram: getPlaybook("instagram") ?? {},
      tiktok: getPlaybook("tiktok") ?? {},
    },
    unitEconomics: getSetting<Record<string, unknown>>("unit_economics") ?? {},
    negotiationStyle: getSetting<Record<string, unknown>>("negotiation_style") ?? {},
  };

  return (
    <>
      <PageHeader
        title="Playbook"
        subtitle="Your rules — every number and every draft traces back to this page"
      />
      <main className="flex-1 overflow-y-auto p-8">
        <PlaybookEditor initial={initial} />
      </main>
    </>
  );
}
