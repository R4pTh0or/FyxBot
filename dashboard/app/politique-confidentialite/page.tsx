import type { Metadata } from "next";
import { PrivacyPage } from "../LegalPage";

export const metadata: Metadata = { title: "Politique de confidentialité | FyxBot", description: "Données Discord et Twitch traitées par FyxBot, sécurité, conservation et exercice des droits." };
export default function Page() { return <PrivacyPage/>; }
