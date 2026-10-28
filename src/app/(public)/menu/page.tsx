import { redirect } from "next/navigation";

/** The list of everything now lives on the home page. */
export default function MenuPage() {
  redirect("/#shop");
}
