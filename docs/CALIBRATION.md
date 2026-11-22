# Guided calibration and Quick Check

## Adaptive calibration

Place the robot centrally, flush with the end line, facing straight down the table with no head rotation. Standard starts with three alignment directions, then searches for net and long limits, tests high arcs, and aims at the middle for topspin, no-spin, and backspin. Complete adds up to 15 shots that broaden coverage. Serve tests are optional.

Connect the Nova S Pro before opening the wizard. Tap **Fire one ball** to send the displayed setting through Prime's training encoder. Once the robot reports completion and Prime sends Stop, mark the first bounce on the player half. Mark Net, Long, or Wide when applicable. These outcomes constrain the physics fit and help the planner choose subsequent shots. Not seen is retained as a run observation but excluded from the fit. During delivery, Stop cancels the shot. A missing completion triggers Stop and leaves the shot available for an explicit retry.

## Saved profiles and Visual Editor

At least three measured landings are required to save. The adaptive planner and bounded physics fit are adapted from nova_fan's Nova Trainer 0.1.0-beta.9. A `trainer-v1` model stores its physics parameters inside the normal local calibration profile and is used directly for centered landing previews and target placement. The displayed fit error is the mean error on the calibration data. Existing profiles still use their original landing correction. A centered physics profile uses baseline estimates for corner positions.

## Quick Check

Use fresh shots after saving. For a physics profile, Quick Check reports baseline and calibrated mean error on the same comparable landings and counts predicted misses separately. Quick Check does not refit the saved profile.

## Responsive layouts

Phone portrait uses one vertical flow with a sticky action footer. Tablet portrait keeps observation instructions and landing controls side by side where space permits. Tablet landscape and desktop use wider multi-column layouts, including a two-column training dashboard and multi-panel visual editor. Short landscape screens reduce chrome and table size while retaining scrolling and reachable actions.
