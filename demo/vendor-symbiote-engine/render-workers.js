function positiveInteger(value, path) {
  let number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${path}: must be a positive integer`);
  }
  return Math.max(1, Math.floor(number));
}

export function partitionRenderFrameRanges(frameCount, workerCount) {
  let frames = positiveInteger(frameCount, 'frameCount');
  let workers = Math.min(frames, positiveInteger(workerCount, 'workerCount'));
  let baseSize = Math.floor(frames / workers);
  let remainder = frames % workers;
  let startFrame = 0;
  let ranges = [];
  for (let workerIndex = 0; workerIndex < workers; workerIndex += 1) {
    let rangeFrameCount = baseSize + (workerIndex < remainder ? 1 : 0);
    let endFrame = startFrame + rangeFrameCount - 1;
    ranges.push({ workerIndex, startFrame, endFrame, frameCount: rangeFrameCount });
    startFrame = endFrame + 1;
  }
  return ranges;
}

export function createRenderFrameCompletionTracker(frameCount) {
  let totalFrames = positiveInteger(frameCount, 'frameCount');
  let completed = new Set();
  let contiguousFrames = 0;

  return {
    mark(frameIndex) {
      let frame = Number(frameIndex);
      if (!Number.isInteger(frame) || frame < 0 || frame >= totalFrames) {
        throw new Error(`frameIndex ${frameIndex} is outside 0..${totalFrames - 1}`);
      }
      if (completed.has(frame)) throw new Error(`frameIndex ${frame} is already completed`);
      completed.add(frame);
      while (completed.has(contiguousFrames)) contiguousFrames += 1;
      return {
        completedFrames: completed.size,
        contiguousFrames,
        totalFrames,
        progress: completed.size / totalFrames,
        contiguousProgress: contiguousFrames / totalFrames,
      };
    },
    get completedFrames() {
      return completed.size;
    },
    get contiguousFrames() {
      return contiguousFrames;
    },
  };
}
