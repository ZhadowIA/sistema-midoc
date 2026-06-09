import { redirect } from "next/navigation";

export default async function ConsultaV2Page(
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  redirect(`/medico/citas/${id}/consulta`);
}
