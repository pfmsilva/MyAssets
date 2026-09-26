import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** A lista por membro passou a ser uma vista da página de ativos. */
export default function MembersRedirect() {
  redirect("/ativos?ver=membro");
}
