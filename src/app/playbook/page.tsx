import PageHeader from "@/components/PageHeader";
import PlaybookEditor from "@/components/playbook/PlaybookEditor";
import CampaignsEditor from "@/components/playbook/CampaignsEditor";
import { getCampaigns, getCampaignSpend, getPlaybook, getSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function PlaybookPage() {
  const initial = {
    // Merge defaults so fields added after an install still appear in the editor.
    platforms: {
      youtube: { minIntegrations: 1, ...(getPlaybook("youtube") ?? {}) },
      instagram: { minIntegrations: 2, ...(getPlaybook("instagram") ?? {}) },
      tiktok: { minIntegrations: 3, ...(getPlaybook("tiktok") ?? {}) },
    },
    // Merge a default so the commission field appears on installs that predate it.
    unitEconomics: {
      commissionPercent: 0,
      commissionPerOrder: 0,
      discountPercent: 0,
      discountFixed: 0,
      productCost: 0,
      minPaidFee: 100,
      ...(getSetting<Record<string, unknown>>("unit_economics") ?? {}),
    },
    negotiationStyle: {
      commissionTiers: [],
      ...(getSetting<Record<string, unknown>>("negotiation_style") ?? {}),
    },
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
