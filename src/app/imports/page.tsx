import PageHeader from "@/components/PageHeader";
import CreatorImportWorkbench from "@/components/imports/CreatorImportWorkbench";

export const dynamic = "force-dynamic";

export default function ImportsPage() {
  return (
    <>
      <PageHeader
        title="Creator intake"
        subtitle="Match provider lists to the pipeline before you create or change a relationship"
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          <CreatorImportWorkbench />
        </div>
      </main>
    </>
  );
}
