import PageHeader from "@/components/PageHeader";
import PlaybookEditor from "@/components/playbook/PlaybookEditor";
import CampaignsEditor from "@/components/playbook/CampaignsEditor";
import {
  getBrandProfile,
  getCampaigns,
  getCampaignSpend,
  getGlobalRules,
  getNegotiationStyle,
  getPlaybook,
  getUnitEconomics,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export default function PlaybookPage() {
  const initial = {
    // Defaults are merged by the getters themselves, so the page and the engine can
    // never disagree about what the rules are.
    platforms: {
      youtube: getPlaybook("youtube") ?? {},
      instagram: getPlaybook("instagram") ?? {},
      tiktok: getPlaybook("tiktok") ?? {},
      facebook: getPlaybook("facebook") ?? {},
    },
    globalRules: getGlobalRules(),
    brandProfile: getBrandProfile(),
    unitEconomics: getUnitEconomics(),
    negotiationStyle: getNegotiationStyle(),
  };

  const campaigns = getCampaigns();
  const spendById = Object.fromEntries(campaigns.map((c) => [c.id, getCampaignSpend(c.id)]));

  return (
    <>
      <PageHeader
        title="Playbook"
        subtitle="Every number and draft traces back to here"
      />
      <main className="flex-1 overflow-y-auto p-8 space-y-4">
        <PlaybookEditor initial={initial} />
        <div id="pb-campaigns" className="scroll-mt-20 max-w-5xl">
          <CampaignsEditor campaigns={campaigns} spendById={spendById} />
        </div>
      </main>
    </>
  );
}
