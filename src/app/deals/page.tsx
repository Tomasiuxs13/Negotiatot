import { redirect } from "next/navigation";

/** The deals table now lives as the Pipeline's list view. */
export default function DealsPage() {
  redirect("/pipeline?view=list");
}
