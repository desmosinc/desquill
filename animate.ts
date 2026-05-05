/**
 * Given `duration` in ms and callback `cb`, immediately calls `cb(progress, scheduleNext, cancel)` with:
 * - `progress` set to `0` if duration > 0, or 1 if duration <= 0
 * - `scheduleNext` a function that schedules a future call to `cb`
 * - `cancel` a function that cancels any pending `scheduleNext` call.
 *
 * `scheduleNext` schedules a call to `cb` with `progress` set to the
 * ratio of currently elapsed time and `duration`.
 *
 * To continue running the animation, `cb` should call `scheduleNext`.
 *
 * To stop the animation, it is the responsibility of `cb` to check
 * whether progress is greater than or equal to 1, in which case `cb`
 * should not call `scheduleNext`.
 *
 * Times are always based on `Date.now()` because the time used in
 * `requestAnimationFrame` can't be obtained before the first rAF tick.
 *
 * `cb` will only be called with strictly monotonic `progress` values.
 *
 * Note: `animate` purposely puts a lot of responsibility on the caller
 * to keep its implementation simple because it isn't used very widely
 * in the project.
 */
export function animate(
  duration: number,
  cb: (progress: number, scheduleNext: () => void, cancel: () => void) => void
) {
  const start = Date.now();
  let cancelToken: number | undefined;
  let progress = 0;
  function step() {
    const proposedProgress = (Date.now() - start) / duration;

    // Enforce that progress is strictly monotonic
    if (proposedProgress <= progress) {
      scheduleNext();
    } else {
      progress = proposedProgress;
    }

    cb(progress, scheduleNext, cancel);
  }
  function cancel() {
    if (cancelToken !== undefined) cancelAnimationFrame(cancelToken);
    cancelToken = undefined;
  }
  function scheduleNext() {
    // Calling cancel here ensures that there are never multiple
    // concurrent callbacks scheduled for a single animation, even if
    // the caller calls `scheduleNext` multiple times in a single
    // event loop (which is always a mistake)
    cancel();
    cancelToken = requestAnimationFrame(step);
  }
  cb(duration <= 0 ? 1 : 0, scheduleNext, cancel);
}
