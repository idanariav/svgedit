# Cutter (Knife)

*Slice a shape into pieces along a straight line or a zigzag.*

## Use case
The Cutter splits a shape into separate pieces by drawing a line across it. Use it
to break a shape apart, create exploded views, cut a path in two, or carve custom
fragments for animation and collage. A zigzag cutting line can carve a non-straight
edge — for example, cracking an ellipse into a "broken egg" with a jagged line
instead of a clean split.

## Relevant for
- A single shape you want to divide.
- Exploded diagrams, fragments, and split artwork.
- Jagged/organic cuts (cracks, tears, broken-egg-style splits).

## How to test it
**Straight cut (instant):**
1. Select the shape you want to cut.
2. Pick the Cutter tool.
3. Drag a line across the shape and release.
4. The shape splits into separate pieces you can move apart.

**Zigzag cut (multi-point):**
1. Select the shape you want to cut.
2. Pick the Cutter tool.
3. Click (don't drag) to place the first point, then click again for each
   further vertex of the zigzag line.
4. Press **Enter** or **double-click** to cut along the line. **Backspace**/
   **Delete** removes the last point; **Escape** cancels the cut entirely.
5. The shape splits into two pieces following the jagged line.

Hold **Shift** while dragging or placing a point to snap that segment to the
nearest 15° angle.

## Related properties
- The cut produces independent shapes — each can be styled and moved on its own.
- A zigzag cut only splits a shape it crosses exactly twice (entering once,
  exiting once); shapes the line doesn't cleanly cross are left unchanged.
- For overlap-based combining instead, see **Boolean Operations**.
