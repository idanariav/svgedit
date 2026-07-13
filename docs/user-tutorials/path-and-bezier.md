# Path & Bezier

*Draw any shape you can imagine, point by point.*

## Use case
The Path tool builds custom shapes from individual points — straight edges,
smooth curves, or both. Use it for arrows, speech bubbles, organic blobs, logos,
and anything the basic shapes can't make. Double-click a finished path to fine-tune
every point.

## Relevant for
- Creating custom or freeform outlines.
- Editing the points of any existing path (double-click to enter edit mode).

## How to test it
1. Click the Path tool, or press **P**.
2. Click on the canvas to drop points one at a time.
3. Click back on your first point (or close the path) to finish.
4. Double-click the path to edit it — drag points, or drag their handles to curve.
5. Select a point and switch its **segment type** between straight and curve.
6. Toggle **Link control points** off, then drag one handle of a curve point —
   only that handle moves, letting you make a sharp corner between two curves.
   Toggle it back on and the handles snap back to mirroring each other.

## Related properties
- **Node X / Node Y** — exact position of the selected point.
- **Segment type** — straight or curved edge into a point.
- **Add / clone / delete node** — change how many points the path has.
- **Open or close path** — finish the outline or leave it open.
- **Add sub-path** — draw a second, separate stroke inside the same shape.
- **Link control points** — when on (the default), dragging one curve handle
  moves the opposite handle to match, keeping the bend smooth on both sides
  of the point. Turn it off to move each handle independently and create a
  corner instead of a smooth curve.
