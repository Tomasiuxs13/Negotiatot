import { getCampaign, getPartnerByToken, getPartnerDeals } from "@/lib/db";
import { readFile } from "@/lib/files";

/**
 * Serves the campaign brief to its creator — token-gated: the partner must actually
 * have a deal on this campaign, so one creator's link can't browse another's brief.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string; campaignId: string }> }
) {
  const { token, campaignId } = await params;
  const partner = getPartnerByToken(token);
  if (!partner) return new Response("Not found", { status: 404 });

  const id = Number(campaignId);
  const hasDeal = getPartnerDeals(partner.id).some((d) => d.campaign_id === id);
  const campaign = getCampaign(id);
  if (!hasDeal || !campaign?.brief_path) return new Response("Not found", { status: 404 });

  try {
    const body = readFile(campaign.brief_path);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": campaign.brief_mime ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${(campaign.brief_filename ?? "brief").replace(/"/g, "")}"`,
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
