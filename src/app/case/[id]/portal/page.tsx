import { PortalAgentView } from "@/components/portal/PortalAgentView";

export default async function PortalPage({ params }: PageProps<"/case/[id]/portal">) {
  const { id } = await params;
  return <PortalAgentView id={id} />;
}
