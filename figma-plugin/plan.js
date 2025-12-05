// Masonry Grid Logic Refinement Plan

/*
Current State:
- Single global `gridState` stored in clientStorage.
- Grid logic is implicit (based on `startX`, `columns` array).
- "Border" is just a visual rectangle floating behind images, loosely coupled.

New Requirements:
1. **Session-based Grids**:
   - First image starts a "Session".
   - A Session = A parent `FrameNode` (or a logical grouping).
   - Subsequent images go into this active Session/Frame.
   - Timeout or manual finish ends the session.
   - New image after timeout = New Session = New Frame.

2. **Resume Capability**:
   - User selects an existing Grid Frame -> Plugin detects it -> Resumes adding images to it.
   - Modifying settings (columns/gaps) applies to the *active* grid (if possible, or future grids).

3. **Technical Approach**:
   - **Container Frame**: Instead of placing images loosely on `currentPage` and drawing a border behind, we should create a **Parent Frame** for the grid.
   - This Parent Frame will hold all images.
   - The "Border" becomes just the styling of this Parent Frame (Stroke).
   - **Auto Layout?**: 
     - Figma's Auto Layout is great but Masonry is hard with native Auto Layout (it only does row/col, not true masonry).
     - We will keep absolute positioning *inside* the Frame, OR use nested Auto Layout columns (Column 1, Column 2, Column 3).
     - **Recommendation**: Nested Auto Layout Columns is robust!
       - Main Frame (Horizontal Auto Layout)
         - Column 1 Frame (Vertical Auto Layout)
         - Column 2 Frame (Vertical Auto Layout)
         - Column 3 Frame (Vertical Auto Layout)
       - Sending an image -> Find shortest column frame -> Append child.
       - **Benefits**:
         - resizing works automatically.
         - Gaps work automatically (Auto Layout gap).
         - "Border" is just the Main Frame's stroke.
         - "Selecting the grid" is easy (click the frame).
         - "Resuming" is easy: Select frame -> Plugin sees it's a "Pinterest Grid" -> Resumes.

   - **Session Logic**:
     - `activeGridFrameId`: string | null.
     - On `create-image`:
       - Check if `activeGridFrameId` is valid.
       - Check if timeout passed (lastActivityTime).
       - OR check if user currently selected a valid Grid Frame.
       - If yes: Append to it.
       - If no: Create NEW Grid Frame structure.

Proposed Implementation Steps:
1. Update `create-image` to use "Auto Layout Column" strategy.
   - Create Main Frame (Auto Layout Horizontal, Align Top).
   - Create N Column Frames (Auto Layout Vertical) inside.
   - Set Gaps on Main Frame.
2. Store `lastActiveGridId` and `lastActivityTimestamp`.
3. On Selection Change (`figma.on('selectionchange')`):
   - If user selects a frame that looks like our grid, update `activeGridFrameId` to it.
   - Update UI to show "Resumed Session".
4. Timeout logic:
   - If (now - lastActivity) > 10 mins (or user configurable?), clear `activeGridFrameId`.
*/

