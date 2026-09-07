import type { Metadata } from "next";
import { PrivacyPage } from "../LegalPage";

export const metadata: Metadata = { title: "Politique de confidentialité | FyxBot", description: "Politique de confidentialité et protection des données de FyxBot." };
export default function Page() { return <PrivacyPage/>; }
