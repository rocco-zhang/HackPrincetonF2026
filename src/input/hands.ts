/** Left hand is 0, right hand is 1. A missing label falls back to detection order. */
export function drawingHandId(label: string | undefined, index: number): 0 | 1 {
  if (label === "Right") return 1;
  if (label === "Left") return 0;
  return index > 0 ? 1 : 0;
}
