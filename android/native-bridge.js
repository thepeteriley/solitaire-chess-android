(() => {
  'use strict';
  let next = 0;
  const pending = new Map(), listeners = new Set();
  const invoke = (method, values = {}) => new Promise((resolve, reject) => {
    const requestId = ++next;
    pending.set(requestId, {resolve, reject});
    try { window.NativeChess.postMessage(JSON.stringify({method, requestId, ...values})); }
    catch (error) { pending.delete(requestId); reject(error); }
  });
  window.__nativeChess = Object.freeze({
    reply(message) {
      const callback = pending.get(message.requestId);
      if (!callback) return;
      pending.delete(message.requestId);
      if (message.error) callback.reject(new Error(message.error)); else callback.resolve(message.value);
    },
    emit(message) { for (const callback of listeners) callback(message); }
  });
  window.chessEngine = Object.freeze({
    platform: 'android', metadata: () => invoke('metadata'), analyze: (position, id) => invoke('analyze', {position, id}),
    stop: () => invoke('stop'), play: (position, elo) => invoke('play', {position, elo}), stopPlay: () => invoke('stopPlay'),
    onAnalysis: callback => { listeners.add(callback); return () => listeners.delete(callback); }, showInfo: () => invoke('showInfo')
  });
})();
