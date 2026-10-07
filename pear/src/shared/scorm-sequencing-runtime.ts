import Scorm2004API from 'scorm-again/scorm2004';
/** Host-only engine construction. Serialized state is always from the trusted database. */
export function sequencingRuntime(tree: Record<string, any>, snapshot?: string) {
  const runtime = new Scorm2004API({logLevel: 'NONE', autocommit: false, lmsCommitUrl: false, accumulateSessionTimeOnTerminate: false,
    sequencing: {activityTree: tree as any, autoRollupOnCMIChange: false, autoProgressOnCompletion: false, validateNavigationRequests: true, enableEventSystem: false, logLevel: 'error'}});
  if (!runtime.getSequencingService()) throw Error('SCORM sequencing engine unavailable');
  if (snapshot && !runtime.deserializeSequencingState(snapshot)) throw Error('Invalid trusted sequencing snapshot');
  if (snapshot) {
    // Upstream restores currentActivity through a setter that reactivates its path.
    // Preserve the trusted persisted active flags, including ended/suspended sessions.
    const states = JSON.parse(snapshot).sequencing?.activityStates;
    const restore = (activity: any) => {
      if (!activity) return;
      if (states?.[activity.id] && typeof states[activity.id].isActive === 'boolean') activity.isActive = states[activity.id].isActive;
      activity.children.forEach(restore);
    };
    restore(runtime.getSequencingState()?.rootActivity);
  }
  return runtime;
}
export function navigationTarget(request: string) {
  const match = /^\{target=([^{}]{1,256})\}(choice|jump)$/.exec(request);
  return match ? {request: match[2], target: match[1]} : {request, target: undefined};
}
export function validNavigation(runtime: Scorm2004API, request: string) {
  if (request === '_none_') return true;
  const nav = navigationTarget(request), allowed = ['continue', 'previous', 'choice', 'jump', 'exit', 'exitAll', 'abandon', 'abandonAll', 'suspendAll'];
  if (!allowed.includes(nav.request) || ['choice', 'jump'].includes(nav.request) && !nav.target) return false;
  // Evaluate complete navigation on a restored copy; the real engine stays unchanged.
  const tree = (runtime.settings.sequencing?.activityTree ?? {}) as Record<string, any>;
  const copy = sequencingRuntime(tree, runtime.serializeSequencingState());
  copy.loadFromJSON(runtime.renderCMIToJSONObject().cmi as Record<string, any>);
  copy.Initialize('');
  return copy.processNavigationRequest(nav.request, nav.target);
}
