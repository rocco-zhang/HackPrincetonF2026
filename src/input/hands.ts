/** Right hand is 0, left hand is 1 (going by the label MediaPipe gives each hand). A missing label falls back to detection order. */
export function drawingHandId(label: string | undefined, index: number): 0 | 1 {
  if (label === "Right") return 0;
  if (label === "Left") return 1;
  return index > 0 ? 1 : 0;
}
