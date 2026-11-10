# Interactive Ball Placement Editor

## JewelFlow

1. **Business challenge** — The existing editor placed a tall table inside a constrained three-column workspace, so its lower portion appeared cut off. Landing markers were generated from sliders but could not be moved, forcing players to guess how the controls affected placement.
2. **Intent** — Make table placement the primary editing action: show the complete table and let a player drag or tap a desired landing point while retaining Nova Prime's additional Height control and canonical safety limits.
3. **Intent analysis** — A landing target is not an independent robot command in the canonical schema. Direction controls lateral placement; Speed is the safest existing control for depth. Height, Spin, type, Tempo, Repeats, and Scatter must not change unexpectedly. Some requested points are unreachable under the current parameters, calibration, or scatter-constrained direction envelope and require an honest closest-estimate result.
4. **Product requirements** — The complete table must remain visible on desktop and tablet layouts. Pointer and keyboard users must be able to reposition the selected ball on the player half. Placement may change only Speed and Direction, must obey `abs(direction) + scatter <= 10`, must retain draft/cancel behavior, and must report the target, chosen controls, and estimated error without claiming physical accuracy.
5. **Solution specification** — Correct the table coordinate orientation, add reversible percent/centimetre mapping, and introduce a deterministic bounded search over Speed and Direction. Use a coarse search followed by local refinement; score calibrated landing distance and penalize non-table outcomes. The editor owns pointer capture, keyboard arrow placement, requested-target state, and draft mutation. CSS uses a two-column preview/control layout with a fitted portrait table and a stacked phone layout.
6. **Generated solution** — Version `0.9.1-layout.0` adds a complete interactive table, player-side target zone, dashed trajectory, target ring, placement readout, drag/tap handling, arrow-key adjustment, closest-safe feedback, and automated domain tests. Its compact responsive shell keeps an outer display margin, puts the drill name beside the editor title, moves Sequential into Program Order, and places Levels 1–3 inside Ball Parameters. Height remains a first-class parameter. It remains a simulation estimate and sends no robot command.

## Interaction contract

- Tap an empty point on the player half to reposition the selected ball.
- Drag the selected marker for continuous visual targeting; fitting occurs when the pointer is released.
- Use arrow keys on the selected ball for small adjustments, or Shift+Arrow for larger adjustments.
- Direct placement changes only Speed and Direction.
- Manual parameter changes clear the requested target and recompute the normal estimate.
- The requested target ring and calculated landing marker remain separate when the target cannot be matched exactly.

## Safety and accuracy boundary

The solver uses Nova Prime's existing estimated physics and active local calibration. It does not prove physical placement. A result more than 15 cm from the request is labelled as the closest safe estimate. Direction is constrained by the active step's Scatter value, and the complete drill is still validated before the existing atomic Save operation.
