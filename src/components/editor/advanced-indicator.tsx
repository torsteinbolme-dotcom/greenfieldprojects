import { Badge } from "@/components/ui/badge";

/** Shown only beside standard inputs an implemented, active advanced module controls. */
export function AdvancedIndicator({ className }: { className?: string }) {
  return <Badge variant="secondary" className={className}>Calculated from Advanced Calculations</Badge>;
}
