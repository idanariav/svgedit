# Frame

*Mark a region of the canvas to export on its own.*

## Use case
A frame is a named rectangle that marks an export region. Draw one around part of
your artwork and the **Export** dialog lets you crop the output to just that area —
handy for slicing one canvas into several images (icons, banners, social sizes)
without splitting your work into separate files. Frames stay in your saved
document but never appear in the exported image.

## Relevant for
- Exporting only a portion of the canvas.
- Defining several export regions in one drawing.

## How to test it
1. Click the **Frame** tool in the top panel.
2. Drag on the canvas to draw a frame. It appears as a dashed, transparent
   rectangle and the tool returns to **Select** afterward.
3. With the frame selected, open the **Frame** section in the right panel and type
   a name in the **Frame name** field.
4. Open **Export**, pick your frame from the region picker, and the image is
   cropped to the frame's bounds.

## Related properties
- **Frame name** — the label shown in the Export dialog's region picker. Select the
  frame and edit it in the right panel's **Frame** section (the change is undoable).
- **Position & size** — a frame moves and resizes exactly like a rectangle; use the
  **Dimensions** fields or drag its handles.
- See **Export** for choosing a region and output format.
