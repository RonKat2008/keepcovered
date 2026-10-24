import { CaseView } from "@/components/case/CaseView";

export default async function CasePage({ params }: PageProps<"/case/[id]">) {
  const { id } = await params;
  return <CaseView id={id} />;
}
