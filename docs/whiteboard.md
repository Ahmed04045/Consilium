# Calendar and network drawings

Available in the **3.1.0-beta.1** development build. The published stable version remains 3.0.0.

Choose **Draw** in a calendar or network. Use Pen to write or circle, Highlight block to mark an area, and Eraser to remove a whole mark. Choose any ink color and a pen width. Undo and redo affect drawings separately from tasks and workflow nodes. Clear drawing is in the drawing toolbar's three-dot menu and can be undone.

Choose Navigate to interact with tasks or pan and zoom a network. Escape closes drawing tools and cancels an unfinished gesture. With drawing tools open, Ctrl+Z undoes a mark; Ctrl+Shift+Z or Ctrl+Y redoes it. Mouse, touch and pen use the same pointer controls; pressure sensitivity is not included.

## Where marks belong

- Network marks use canvas coordinates, so they move and scale with the graph camera. Drawing does not change the network revision or execution approval.
- Calendar marks belong to one calendar, view and visible period. Month, week and day drawings are separate. Changing the displayed period hides its marks; returning shows them again. Resizing preserves their relative positions on the grid. Changing the week-start setting selects a different period layout.
- Drawings are visual annotations. They do not move with individual tasks or nodes when those objects are edited. Hourly marks cover the time grid, excluding hour labels and the all-day row.

## Saving and recovery

Finished gestures save automatically into the existing local vault. An unsaved recovery copy stays in browser storage until saving succeeds. Save failures keep the drawing visible and offer Retry save, Load saved drawing and Export recovery copy. Loading the saved drawing explicitly discards the unsaved drawing in this view; export a recovery copy first if needed. Closing a tab, closing the app or exporting a project waits for its active drawing save.

Portable `.consi` calendar and network projects include their drawings. Opening a project creates independent owner and drawing records while preserving marks. Backups include drawings. Deleting a calendar or network also deletes its drawings.

Phone synchronization and assistant context do not include drawings in this beta. Export drawing produces a standalone JSON copy for inspection or recovery, rather than an image or a directly importable project.

Each board supports up to 300 marks, 4,096 points per stroke and 40,000 points in total. Excess or invalid data is rejected without replacing the saved board.

## Verification — 2 November 2026

- Rust workspace: 105 tests passed; two existing opt-in checks remained ignored. Synthetic provider tests required localhost access outside the restricted sandbox.
- All 33 desktop browser cases passed. One case needed a rerun after Windows reported a transient error opening its screenshot file; the rerun passed. Drawing coverage includes narrow layouts, full scrollable hourly width, calendar/view isolation, undo/redo, zoom, erasing, cancelled gestures and conflict recovery after reload.
- Production frontend, release CLI and Windows NSIS packaging succeeded.
- Packaged native desktop and CLI acceptance passed the learning, code/data and synthetic ML workflows. It also drew on populated calendars and networks, checked that network records stayed unchanged, and verified that both project types preserved drawings through export/import.

Acceptance uses an isolated temporary vault and synthetic provider responses. The installer is unsigned and has not been tested on a clean Windows machine. The beta is distributed as a separate prerelease; the published 3.0.0 stable release is unchanged. Installer checksum: [whiteboard-beta.sha256](whiteboard-beta.sha256).
