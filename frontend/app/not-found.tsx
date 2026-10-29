import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="shell flex min-h-[60vh] items-center py-16">
      <div className="w-full max-w-xl">
        <p className="label">404 · not found</p>
        <h1 className="display mt-4 text-[clamp(40px,6vw,64px)] text-ink">
          This page doesn&apos;t exist.
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
          This link doesn&apos;t match any page. If you&apos;re looking for a specific round or
          proposal, start from the round list — every id there comes straight from
          the contract.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link href="/rounds">
              <Search className="size-4" />
              Browse rounds
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/">
              <ArrowLeft className="size-4" />
              Go home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
