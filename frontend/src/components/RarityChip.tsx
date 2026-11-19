import { rarityKey } from "../lib/format";

export function RarityChip({ rarity }: { rarity: string }) {
  if (!rarity) return null;
  return <span className="chip" data-rarity={rarityKey(rarity)}>{rarity}</span>;
}
