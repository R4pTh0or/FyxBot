import type { Metadata } from "next";
import { TermsPage } from "../LegalPage";

export const metadata: Metadata = { title: "Conditions d’utilisation | FyxBot", description: "Conditions d’utilisation de FyxBot, de son panel et de ses intégrations Discord et Twitch." };
export default function Page() { return <TermsPage/>; }
