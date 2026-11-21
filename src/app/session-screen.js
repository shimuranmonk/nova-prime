// Playback updates must not detach a button between pointerdown and click.
// Keep the control row and its ancestors alive throughout a focused session.
export function updateSessionScreen(view, html) {
  const current = view.querySelector('.training-focus > section');
  if (!current) return false;
  const template = view.ownerDocument.createElement('template');
  template.innerHTML = html;
  const next = template.content.querySelector('.training-focus > section');
  if (!next) return false;
  const countdown = current.classList.contains('countdown-screen');
  if (countdown !== next.classList.contains('countdown-screen')) return false;
  if (countdown) {
    for (const selector of ['.eyebrow', '.countdown-number']) {
      const target = current.querySelector(selector);
      const text = next.querySelector(selector).textContent;
      if (target.textContent !== text) target.textContent = text;
    }
    return true;
  }
  const actions = current.querySelector('.console-actions');
  const nextActions = next.querySelector('.console-actions');
  if (!actions || !nextActions) return false;
  for (const button of actions.querySelectorAll('[data-command]')) {
    const updated = nextActions.querySelector(`[data-command="${button.dataset.command}"]`);
    button.disabled = updated.disabled;
  }
  // Only replace readouts. In particular, never remove actions or its parents.
  for (const child of [...current.childNodes]) if (child !== actions) child.remove();
  for (const child of [...next.childNodes]) if (child !== nextActions) current.insertBefore(child, actions);
  return true;
}
