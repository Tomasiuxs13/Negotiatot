import { getShipmentByToken } from "@/lib/fulfillment";
import { getBrandProfile } from "@/lib/db";
import AddressForm from "@/components/ship/AddressForm";

export const dynamic = "force-dynamic";

/**
 * The creator-facing address form. Public by design — the link is the credential — so
 * this page shows only what its recipient already knows: their own name, the product
 * they're being sent, and the brand sending it. No prices, no deal state, no nav.
 */
export default async function ShipmentFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const shipment = getShipmentByToken(token);
  const brand = getBrandProfile() as Record<string, string>;
  const brandName = brand.brandName || "the team";

  if (!shipment) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-8 max-w-md text-center">
          <p className="text-sm font-medium text-slate-800 mb-1">This link isn&apos;t valid</p>
          <p className="text-sm text-slate-500">
            It may have been replaced with a newer one — check with your contact.
          </p>
        </div>
      </main>
    );
  }

  const shipped = shipment.status !== "to_prepare";

  return (
    <main className="min-h-screen flex items-start justify-center p-6 pt-16">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-8">
          <h1 className="font-headline text-lg font-semibold text-slate-900">
            Where should we send your {shipment.product}?
          </h1>
          <p className="text-sm text-slate-500 mt-1 mb-6">
            Hi {shipment.creator} — {brandName} is sending you the {shipment.product}. Fill in
            your delivery details below and we&apos;ll get it on its way.
          </p>

          {shipped ? (
            <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-md p-4">
              This shipment is already on its way
              {shipment.tracking ? (
                <>
                  {" "}
                  — tracking <span className="font-tabular font-medium">{shipment.tracking}</span>
                </>
              ) : null}
              . If the address is wrong, contact us directly.
            </p>
          ) : (
            <AddressForm
              token={token}
              initial={{
                recipient: shipment.recipient ?? shipment.creator,
                address: shipment.address ?? "",
                phone: shipment.phone ?? "",
              }}
              alreadySubmitted={shipment.address_submitted_at != null}
            />
          )}
        </div>
        <p className="text-[11px] text-slate-400 text-center mt-3">
          Your details go only to {brandName} for this delivery.
        </p>
      </div>
    </main>
  );
}
