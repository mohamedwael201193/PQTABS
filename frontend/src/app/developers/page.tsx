import type { Metadata } from "next";
import DevelopersPage from "@/components/pqtabs/developers/DevelopersPage";

export const metadata: Metadata = {
  title: "PQTABS for developers: SDK and MCP server",
  description:
    "Install pqtabs-sdk and pqtabs-mcp, connect an MCP host, and let an agent pay inside a post-quantum capability on Arc mainnet. Read-only first.",
  openGraph: {
    title: "PQTABS for developers",
    description: "The PQTABS TypeScript SDK and local MCP server for Arc mainnet.",
    type: "website",
  },
};

export default function Page() {
  return <DevelopersPage />;
}
