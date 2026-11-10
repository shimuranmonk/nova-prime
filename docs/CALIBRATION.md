# Guided calibration and Quick Check

## Implemented scope

Nova Prime provides two transport-free calibration plans:

- **Standard:** five observations covering topspin, no spin, backspin, fast topspin, and a short serve.
- **Complete:** ten observations that repeat the Standard plan so shot-to-shot scatter can be estimated.

For each observation, Nova Prime displays the ball settings and a predicted landing. The user sends one ball using the robot's own controls or another safe controller, then taps the observed first bounce or records Net, Long, Wide, or Not seen. Undo returns to the previous observation.

Nova Prime never connects to the robot or sends a calibration ball in this increment.

## Calculated profile

At least three landed observations are required. Saving calculates bounded average lateral and depth offsets, residual accuracy, and—when repeated observations exist—scatter. The validated profile is written once to the local `calibrations` store. Its offsets adjust successful visual drill-preview landings; they do not alter stored drill parameters or create robot commands.

Profiles use the versioned `nova-prime-calibrations` JSON format for atomic import and export. Complete application backup also includes calibration profiles.

## Quick Check

Quick Check records three representative observations against the active calibrated estimate. It reports mean placement error and provides conservative Net, Long, Wide, and recalibration guidance. Quick Check does not refit the saved profile.

## Responsive layouts

Phone portrait uses one vertical flow with a sticky action footer. Tablet portrait keeps observation instructions and landing controls side by side where space permits. Tablet landscape and desktop use wider multi-column layouts, including a two-column training dashboard and multi-panel visual editor. Short landscape screens reduce chrome and table size while retaining scrolling and reachable actions.
