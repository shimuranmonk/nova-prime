# Interactive Ball Placement Editor

## JewelFlow

1. **Business challenge** — The existing editor placed a tall table inside a constrained three-column workspace, so its lower portion appeared cut off. Landing markers were generated from sliders but could not be moved, forcing players to guess how the controls affected placement.
2. **Intent** — Make table placement the primary editing action: show the complete table and let a player drag or tap a desired landing point while retaining Nova Prime's additional Height control and canonical safety limits.
3. **Intent analysis** — A landing target is not an independent robot command in the canonical schema. Drop controls lateral placement; Speed is the safest existing control for depth. Height, Spin, type, BPM, Reps, and Scatter must not change unexpectedly. Some requested points are unreachable under the current parameters, calibration, or scatter-constrained Drop envelope and require an honest closest-estimate result.
4. **Product requirements** — The complete graduated table must remain visible on desktop and tablet layouts with a synchronized Height adjuster and Left/Middle/Right robot position. Pointer and keyboard users must be able to reposition the selected ball on the player half. Placement may change only Speed and Drop, must obey `abs(drop) + scatter <= 10`, must retain draft/cancel behavior, and must report the target, chosen controls, and estimated error without claiming physical accuracy.
   Active must preserve but exclude a complete step. Serve must use Nova Trainer's negative-Height convention, show the robot-side first bounce, and remain in its sequence position when other balls are randomized.
5. **Solution specification** — Correct the table coordinate orientation, add reversible percent/centimetre mapping, and introduce a deterministic bounded search over Speed and Drop. Use a coarse search followed by local refinement; reject candidates that violate the Nova Plus speed-dependent Spin limit, score calibrated landing distance, and penalize non-table outcomes. The editor owns pointer capture, keyboard arrow placement, one aligned requested marker, and draft mutation. CSS uses a two-column preview/control layout with a fitted portrait table and a stacked phone layout.
6. **Generated solution** — Version `0.10.0-parameter-calibration.0` combines the Nova Trainer graduated table and vertical Height control with Nova Plus parameter truth. It keeps the marker, target ring, and dashed trajectory aligned; moves the drill name to the far right; places Sequential in Program Order and Levels 1–3 in Ball Parameters; and adds response-based calibration. It remains an estimate and sends no robot command from the editor.

Version `0.11.0-active-serve.0` adds the verified Active and Serve controls. Active maps to the existing step-level flag. Serve maps to Height below zero, renders the first robot-side bounce, uses the normal negative-Height robot encoding, and preserves serve positions during random ordering.

## Interaction contract

- Tap an empty point on the player half to reposition the selected ball.
- Drag the selected marker for continuous visual targeting; fitting occurs when the pointer is released.
- Use arrow keys on the selected ball for small adjustments, or Shift+Arrow for larger adjustments.
- Direct placement changes only Speed and Drop.
- Manual parameter changes clear the requested target and recompute the normal estimate.
- The requested target ring and calculated landing marker remain separate when the target cannot be matched exactly.

## Safety and accuracy boundary

The solver uses Nova Prime's existing estimated physics and active local calibration. It does not prove physical placement. A result more than 15 cm from the request is labelled as the closest safe estimate. Drop is constrained by the active step's Scatter value, Spin by the selected Speed, and the complete drill is still validated before the existing atomic Save operation.
