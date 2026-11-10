# Nova Prime Interface Direction

## Approved visual hierarchy

Nova Prime uses Nova Trainer as its primary interaction model: a compact application header, prominent connection and calibration status, card-based drill libraries, custom-drill groups, and training totals. It incorporates Nova Plus controls where they improve the training workflow: difficulty levels, Reps/Time/Music/MSYNC mode selection, count or duration, pause, and compact session actions.

## Implemented app shell

- Training is the default route; the development-style landing hero is removed.
- Connection and calibration appear first. Calibration is operational through manual observations; robot connection remains disabled until its safety milestone is complete.
- Reps and Time controls operate the existing local dry-run controller.
- Music and MSYNC are visible as disabled future modes rather than represented as complete.
- The built-in drill area contains the verified 34-drill Nova Trainer catalogue with its 6 Basic, 12 Combined, and 16 Complex entries.
- Custom groups A, B, and C support persistent creation, naming, duplication, group moves, ordering, deletion, import/export, selection, and dry-run sessions.
- New custom drills begin with one canonical ball, then open into a responsive visual editor for Levels 1–3, ordered steps, ball variants, and estimated landings.
- Data, About, Diagnostics, and Roadmap are moved into an application drawer.
- Active-session progress and Stop remain prominent and accessible.
- The layout is responsive for phone portrait, tablet portrait, tablet landscape, and desktop web use from the same static bundle. Tablet landscape uses a wider two-column training dashboard instead of stretching the phone layout, while editors use additional columns for previews, steps, and parameters.

## Visual language

The base presentation is light, compact, and card-led, with Nova teal for selected and primary actions. Nova Plus contributes the segmented modes and compact parameter controls without replacing the Trainer-oriented information hierarchy. Status is communicated through text as well as color.

## Safety representation

The interface never presents disabled robot, Music, or MSYNC functionality as operational. Custom drill management, visual editing, and manual guided calibration are operational. Calibration explicitly states that the user sends test balls with a separate safe control path; Nova Prime sends no robot command. Table placement and sessions remain labelled as estimates or simulation and record zero physically dispatched balls.
