const { env } = require('../config/env');

let activeStreams = 0;

function tryAcquireStreamSlot() {
  if (activeStreams >= env.maxConcurrentStreams) {
    return null;
  }

  activeStreams += 1;

  let released = false;

  return {
    release() {
      if (released) {
        return;
      }

      released = true;
      activeStreams = Math.max(0, activeStreams - 1);
    },
  };
}

function getStreamCapacitySnapshot() {
  return {
    activeStreams,
    maxConcurrentStreams: env.maxConcurrentStreams,
    availableSlots: Math.max(0, env.maxConcurrentStreams - activeStreams),
  };
}

module.exports = {
  tryAcquireStreamSlot,
  getStreamCapacitySnapshot,
};
