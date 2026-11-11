# Nova Prime Interface Direction

> `0.11.0-active-serve.0` makes the graduated complete table the primary drill-editing surface with aligned direct placement, a synchronized Height adjuster, Nova Plus parameter controls, Trainer Active/Serve controls, all four themes, and the explicit robot gate.

## Approved visual hierarchy

Nova Prime uses Nova Trainer as its primary interaction model: a compact application header, prominent connection and calibration status, card-based drill libraries, custom-drill groups, and training totals. It incorporates Nova Plus controls where they improve the training workflow: difficulty levels, Reps/Time/Music/MSYNC mode selection, count or duration, pause, and compact session actions.

## Implemented app shell

- Training is the default route; the development-style landing hero is removed.
- Connection and calibration appear first. Calibration is operational through manual observations; robot connection states that simulated executor checks pass but remains disabled until the physical release gate is complete.
- Reps and Time controls operate the existing local dry-run controller. Music uses that same lifecycle while owning local audio playback.
- Music is operational through a dedicated library, playlists, Quick Music, and training progress. MSYNC is operational for strict validation and simulation while live transport remains disabled.
- The built-in drill area contains the verified 34-drill Nova Trainer catalogue with its 6 Basic, 12 Combined, and 16 Complex entries.
- Custom groups A, B, and C support persistent creation, naming, duplication, group moves, ordering, deletion, import/export, selection, and dry-run sessions.
- New custom drills begin with one canonical ball, then open into a responsive visual editor for Levels 1–3, ordered steps, ball variants, Height, and direct drag/tap/keyboard landing targets. The complete table remains visible beside compact controls on wider screens and stacks above them without clipping on phones. The editor retains an outer margin at every viewport size.
- Music, MSYNC, Statistics, Sharing, Data, About, Diagnostics, and Roadmap are moved into an application drawer.
- Active-session progress and Stop remain prominent and accessible.
- The layout is responsive for phone portrait, tablet portrait, tablet landscape, and desktop web use from the same static bundle. Tablet landscape uses a wider two-column training dashboard instead of stretching the phone layout, while editors use additional columns for previews, steps, and parameters.

## Visual language

The base presentation is light, compact, and card-led, with Nova teal for selected and primary actions. Nova Plus contributes the segmented modes and compact parameter controls without replacing the Trainer-oriented information hierarchy. Status is communicated through text as well as color.

## Safety representation

The interface never presents disabled robot functionality or simulated MSYNC as live transport. Custom drill management, visual editing, manual guided calibration, local Music, MSYNC validation/simulation, local Statistics, versioned Sharing, optional Voice, and Nova Plus custom-drill CSV migration are operational. Voice exposes one deliberate Listen action, an exact-command disclosure, a privacy note, and a prominent touch confirmation for Start. Calibration explicitly states that the user sends test balls with a separate safe control path; Nova Prime sends no robot command. Music is labelled as local audio, while table placement and sessions remain estimates or simulation and record zero physically dispatched balls. Statistics are labelled as activity analytics rather than skill scoring. Sharing and migration separate read-only preview from confirmed atomic import and state when the source remains unchanged.
