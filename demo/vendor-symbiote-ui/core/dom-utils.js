export function waitForElementApi(element, methodName, timeoutMs = 2000) {
  if (!element || typeof element[methodName] === 'function') return Promise.resolve(element);
  return new Promise((resolve) => {
    let startedAt = Date.now();
    function check() {
      if (typeof element[methodName] === 'function' || Date.now() - startedAt >= timeoutMs) {
        resolve(element);
        return;
      }
      requestAnimationFrame(check);
    }
    check();
  });
}
