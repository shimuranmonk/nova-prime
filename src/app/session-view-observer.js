// Terminal transitions must render even after the active-session clock stops.
export function observeSessionView(controller, { render, isVisible = () => true, onError = console.error }) {
  let previous = controller.snapshot();
  let scheduled = false;
  return controller.subscribe(snapshot => {
    const changed = snapshot.state !== previous.state || snapshot.recordError !== previous.recordError;
    previous = snapshot;
    if (!changed || scheduled || !isVisible()) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (isVisible()) Promise.resolve().then(render).catch(onError);
    });
  });
}
