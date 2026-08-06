export {
  registerMediaProvider,
  getMediaProvider,
  hasMediaProvider,
  listMediaProviders,
  unregisterMediaProvider,
} from './provider-registry.js';

export { IMAGE_MEDIA_ADAPTER, IMAGE_PROVIDER_KEY } from './adapters/image-adapter.js';
export { YOUTUBE_MEDIA_ADAPTER, YOUTUBE_PROVIDER_KEY } from './adapters/youtube-adapter.js';

export { default as MediaHost } from './MediaHost/MediaHost.js';
