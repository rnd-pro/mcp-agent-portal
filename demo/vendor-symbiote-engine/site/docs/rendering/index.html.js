import { renderDocsPage } from 'library-pages/shell';
import { docsRoutes, docsSiteConfig } from '../../site.config.js';

const currentRoute = docsRoutes.find((route) => route.path === '/docs/rendering/');

export default renderDocsPage({
  siteConfig: docsSiteConfig(currentRoute),
  routes: docsRoutes,
  currentRoute,
  contentHtml: /*html*/ `
  <div class="docs-header" id="overview">
    <h1>Media Rendering</h1>
    <p>
      Symbiote Engine includes server-side modules for provider-neutral contracts, host-process in-memory queues, an injected browser-capture adapter, and pure argument/projection/report helpers.
    </p>
  </div>

  <section>
    <h2 id="queues">Render & Audio Queues</h2>
    <p>
      The engine provides specialized queuing utilities to coordinate resource-intensive media operations. Both queues run as in-memory data structures inside the local host process and do not orchestrate tasks across multiple remote host environments.
    </p>

    <h3>Audio Provider Job Queue</h3>
    <p>
      Created via <code>createAudioProviderJobQueue({ registry })</code>, this queue coordinates voice generation and audio processing tasks.
    </p>
    <ul>
      <li>
        <strong>Priority & Concurrency:</strong> Tasks are prioritized as either <code>interactive</code> or <code>batch</code>. Higher priority tasks are placed at the front of the wait list but do not preempt or abort already running tasks. Concurrency and limits can be controlled using the <code>capacityByGroup</code> option.
      </li>
      <li>
        <strong>Timeout:</strong> Unlike render jobs, the timeout for an audio job starts ticking the moment the job is accepted into the queue.
      </li>
      <li>
        <strong>Idempotency & Caching:</strong> In-flight requests are deduplicated by cache key, and successful outputs are cached in an in-memory registry to avoid redundant operations.
      </li>
      <li>
        <strong>Readiness Polling:</strong> Prior to execution, the queue checks the destination provider's readiness status. If the provider is not ready, the job is put back into the queue for a retry after a fixed delay. Callers should await the job status using the <code>wait(jobId)</code> API, rather than assuming that the queue's <code>drain()</code> method will make all pending readiness-waiting jobs terminal.
      </li>
    </ul>

    <h3>Render Provider Job Queue</h3>
    <p>
      Created via <code>createRenderProviderJobQueue({ registry })</code>, this queue schedules browser capture and frame processing jobs.
    </p>
    <ul>
      <li>
        <strong>Concurrency & Progress:</strong> Supports global concurrency parameters, stage monitoring events, cancel/abort triggers, and cleanups.
      </li>
      <li>
        <strong>Timeout Behavior:</strong> The timeout countdown starts after dequeue (meaning when the job moves from the queue into active execution). If the job times out, it is marked as <code>failed</code> with the <code>timeout: true</code> flag.
      </li>
    </ul>
  </section>

  <section>
    <h2 id="audio-providers">Local Audio Providers</h2>
    <p>
      Audio providers are host-configured HTTP clients that interface with external speech-to-text or text-to-speech services using an injected fetch client and local artifact storage.
    </p>
    <div class="callout callout--warning">
      <h4>Integration Boundaries</h4>
      <p>
        The engine does not supply pre-configured OpenAI or ElevenLabs models, endpoints, or api keys. Connecting to these platforms is the host application's responsibility. Additionally, handler-declared TTS/Whisper timeout is not forwarded to the queue; it is not a generic provider timeout contract.
      </p>
    </div>
  </section>

  <section>
    <h2 id="browser-capture">Screencast & Browser Capture</h2>
    <p>
      Visual frame rendering leverages Chromium via Puppeteer to capture web-based templates. Puppeteer is required injection; <code>execFile</code> is optional because the provider defaults to Node's implementation.
    </p>
    <ul>
      <li>
        <strong>Deterministic Rendering:</strong> To prevent animation timing drift, the capture provider can invoke a host-managed rendering clock on the target page, manually stepping through frames rather than relying on real-time browser execution.
      </li>
      <li>
        <strong>Frame Partitioning:</strong> The <code>partitionRenderFrameRanges(frameCount, workerCount)</code> utility is a mathematical helper that divides a total frame count into ranges (e.g. <code>startFrame</code>, <code>endFrame</code>) to support parallel processing. This is a helper function and does not initialize node threads, OS processes, or distributed executors. The <code>normalizeRenderJob</code> helper normalizes/projects the required <code>id</code>, <code>kind</code>, and <code>providerId</code> fields while preserving other job fields; it does not normalize host stages/phases or perform capture.
      </li>
      <li>
        <strong>Sandbox & Seams:</strong> Passing <code>--no-sandbox</code> to Chromium is a launch preference and does not constitute a security boundary. Parallel deterministic capture requires leader-exported canonical setup state before boundary seam checks. Boundary checks do not prove every frame.
      </li>
    </ul>
  </section>

  <section>
    <h2 id="finalize-proof">Finalize & Proof Verification</h2>
    <p>
      After capturing frames and generating audio tracks, helper utilities are pure argument, projection, and report helpers. They do not merge, encode, inspect media bytes, run FFmpeg/ffprobe, or produce cryptographic attestations.
    </p>

    <h3>FFmpeg & ffprobe Arguments Compiler</h3>
    <p>
      Utilities compile arguments for external media tools:
    </p>
    <ul>
      <li>
        <strong><code>buildFrameSequenceEncodeArgs</code>:</strong> Compiles the options needed to stitch frame files and overlay caption tracks into a video.
      </li>
      <li>
        <strong><code>buildAudioConcatArgs</code>:</strong> Compiles arguments to concatenate segments together.
      </li>
      <li>
        <strong><code>buildAudioOverlapMixArgs</code>:</strong> Builds the command flags and filter complexes required to mix and overlap audio clips.
      </li>
      <li>
        <strong><code>buildAudioMuxArgs</code>:</strong> Compiles arguments to merge video and audio files into a final container.
      </li>
      <li>
        <strong><code>parseFfprobeJson</code>:</strong> Parses the JSON output of a probe command. Malformed or invalid JSON input will cause the parser to throw a custom <code>E_FFPROBE_JSON</code> error.
      </li>
    </ul>

    <h3>Synchronous Proof Verification Reports</h3>
    <p>
      The <code>buildRenderAudioLayerProof</code> and <code>buildRenderAvSyncProof</code> functions compare caller-supplied metadata and stream timing details to generate validation reports. They are not cryptographic attestations or binary-level provenance verifications.
    </p>
  </section>
`,
});
