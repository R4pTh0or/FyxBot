import type { Metadata } from "next";
import { TermsPage } from "../LegalPage";

export const metadata: Metadata = { title: "Conditions d’utilisation | FyxBot", description: "Conditions d’utilisation du bot Discord FyxBot." };
export default function Page() { return <TermsPage/>; }
