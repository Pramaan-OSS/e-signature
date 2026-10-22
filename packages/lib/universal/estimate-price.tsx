export function EstimatePrice({
  priceMaxMicro,
  priceTypicalMicro,
}: {
  priceMaxMicro: number;
  priceTypicalMicro?: number;
}) {
  return priceTypicalMicro !== undefined ? (
    <p>
      <strong>usually about ${(priceTypicalMicro / 1_000_000).toFixed(6)}</strong>
      <small className="block">at most ${(priceMaxMicro / 1_000_000).toFixed(6)}</small>
    </p>
  ) : (
    <p>Maximum cost: ${(priceMaxMicro / 1_000_000).toFixed(6)} USD.</p>
  );
}
