import { TraceView } from "@/components/trace/TraceView";

export default async function TracePage({ params }: PageProps<"/trace/[id]">) {
  const { id } = await params;
  return <TraceView id={id} />;
}
