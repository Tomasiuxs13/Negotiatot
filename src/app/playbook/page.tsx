import PageHeader from "@/components/PageHeader";
import PlaybookEditor from "@/components/playbook/PlaybookEditor";
import CampaignsEditor from "@/components/playbook/CampaignsEditor";
import { getCampaigns, getCampaignSpend, getPlaybook, getSetting } from "@/lib/db";

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

  const campaigns = getCampaigns();
  const spendById = Object.fromEntries(campaigns.map((c) => [c.id, getCampaignSpend(c.id)]));

  return (
    <>
      <PageHeader
        title="Playbook"
        subtitle="Your rules — every number and every draft traces back to this page"
      />
      <main className="flex-1 overflow-y-auto p-8 space-y-4">
        <PlaybookEditor initial={initial} />
        <div className="max-w-5xl">
          <CampaignsEditor campaigns={campaigns} spendById={spendById} />
        </div>
      </main>
    </>
  );
}
