import { Reveal, SectionHeading, SectionShell } from "@/components/pqtabs/shared";

/**
 * ProofSection — only receipts and limits that the repository has already checked.
 * Links go to the Arc explorer, Sourcify, the app, and the repository.
 */

const PATHS = [
  { label: "Live app", href: "https://pqtabs.vercel.app" },
  { label: "Developer setup", href: "/developers" },
  { label: "GitHub", href: "https://github.com/mohamedwael201193/PQTABS" },
  { label: "SDK and MCP", href: "https://github.com/mohamedwael201193/PQTABS/tree/main/packages" },
] as const;

const RECEIPTS = [
  {
    label: "Browser capability opened",
    detail: "360 raw, 24 hours, 2026-10-14. The security key signed it.",
    href: "https://explorer.arc.io/tx/0xf1711679b2256b6fe3050fc2f89b01d489f3619d096b4d943b115369f97f250c",
  },
  {
    label: "Browser research payment",
    detail: "360 raw USDC to the merchant. The answer was returned after the receipt matched.",
    href: "https://explorer.arc.io/tx/0x53fc6e7c43b71cd14f98e70f8fbd182d55b55d3bed471f56ac5d0a00a88e6ebc",
  },
  {
    label: "That capability closed",
    detail: "The security key closed it. Remaining balance was already zero.",
    href: "https://explorer.arc.io/tx/0x8b6ba50cf54bf13534c168088f1db533327c19606c8ddc86385a0cd771e5312c",
  },
  {
    label: "Local-signer capability opened",
    detail: "A new Windows signer, not the older agent. Same 360-raw cap.",
    href: "https://explorer.arc.io/tx/0x6ad0ecd5c3f8f1f998a54a34860ff14270742242024ea2a35ce3211eb96c2895",
  },
  {
    label: "Local-signer research payment",
    detail: "360 raw through the repository SDK. The capability was then closed.",
    href: "https://explorer.arc.io/tx/0xed9892c88c9b499f0195278285c58c9bc51075435500a9c1ddc7c4851eb2e9a4",
  },
  {
    label: "Local-signer close",
    detail: "Root cash received the close. The agent could not spend again.",
    href: "https://explorer.arc.io/tx/0x00599bddc317eb31d60620727e8ef1b9bdbe05014d02557c56c6ff8ee207083d",
  },
  {
    label: "Standard x402 exact settlement",
    detail: "Arclight settled 360 raw. Circle's facilitator was not called.",
    href: "https://explorer.arc.io/tx/0x9598e26dc991600971af4a18b05943ca72ae74752581bcb8432ef5714b2673db",
  },
  {
    label: "RootFactory deployment",
    detail: "The factory behind the live demo root.",
    href: "https://explorer.arc.io/tx/0xfade67cbf64d0869dbd33f53bd48844f0b3b4399d2c54b68c36a0b07ba30c916",
  },
  {
    label: "RootFactoryNext deployment",
    detail: "New roots only. Existing roots are not migrated.",
    href: "https://explorer.arc.io/tx/0x68c7ce22eb265bdedbeeab2820fe4f17c6c4f8abce44aa457315a09da84080f1",
  },
] as const;

const LIMITS = [
  "The live demo root is a clone of the original PQRoot. It cannot be upgraded, and it has no delayed recovery.",
  "PQRootNext can schedule a key change that waits 7 days. If both keys are lost, or both are stolen, that schedule does not help.",
  "The Galaxy USDC vault reported maxDeposit of 0 on 2026-10-14. No USDC has been deposited.",
  "Barkeep's factory and tab implementation have bytecode on Arc. Their source is not verified, and it is not in this repository.",
  "A live Circle signature has not been produced. Circle compatibility is not verified.",
  "Published pqtabs-mcp 0.1.2 stops before signing when a quote includes both the research price and an exact row. The SDK in this repository accepts a matching exact row.",
  "The research price is 360 raw USDC, a demo subsidy. The relayer pays the Arc gas, which costs more than that charge.",
] as const;

function outside(href: string): boolean {
  return href.startsWith("http");
}

export default function ProofSection() {
  return (
    <SectionShell id="proof" index="10" label="Mainnet proof">
      <SectionHeading
        title="The receipts are on Arc."
        lead="The security key signs an open and a close. The agent signs a spend. The connected wallet does neither. The relayer pays the gas and broadcasts."
      />

      <ul className="mt-8 flex flex-wrap gap-2">
        {PATHS.map((path) => (
          <li key={path.href}>
            <a
              href={path.href}
              {...(outside(path.href) ? { target: "_blank", rel: "noreferrer" } : {})}
              className="inline-flex h-9 items-center rounded-lg border border-white/10 bg-white/[.03] px-3 text-sm text-foreground transition-colors hover:border-gold/40 hover:bg-white/[.06]"
            >
              {path.label}
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-10 grid gap-3 md:grid-cols-2">
        {RECEIPTS.map((receipt, index) => (
          <Reveal key={receipt.href} delay={index * 0.03}>
            <a
              href={receipt.href}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl border border-white/[.08] bg-[#0e1013] px-4 py-4 transition-colors hover:border-gold/30"
            >
              <p className="font-display text-base font-medium text-foreground">{receipt.label}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{receipt.detail}</p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-gold">Arc explorer</p>
            </a>
          </Reveal>
        ))}
      </div>

      <div className="mt-10 rounded-xl border border-white/[.08] bg-white/[.02] px-4 py-4 sm:px-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Limits that stay in force</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-foreground/85">
          {LIMITS.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Contract addresses and Sourcify status are in the repository README. RootFactory and PQRoot match on Sourcify. Barkeep does not.
        </p>
      </div>
    </SectionShell>
  );
}
