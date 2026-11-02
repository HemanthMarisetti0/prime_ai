import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import type { YouTubeResults, YouTubeVideo } from '@prime/shared';
import { loadYouTubeApi, type YTPlayer } from '../media/youtubeApi';
import { CloseIcon } from './icons';

const DEFAULT_VOLUME = 80;
const DUCKED_VOLUME = 15;
export const VOLUME_STEP = 20;

export interface MediaControls {
  pause(): void;
  resume(): void;
  /** Changes volume by a step and returns the new level. */
  changeVolume(delta: number): number;
  mute(): void;
  unmute(): void;
}

export interface MediaSession {
  results: YouTubeResults;
  /** Currently loaded video (null when only a search link is available). */
  current: YouTubeVideo | null;
  autoplay: boolean;
  /** Changes whenever the same video should be (re)loaded. */
  nonce: number;
}

interface YouTubePanelProps {
  session: MediaSession;
  /** Lower the volume while P.R.I.M.E. speaks or listens. */
  ducked: boolean;
  controlsRef: Ref<MediaControls | null>;
  onSelect: (video: YouTubeVideo) => void;
  onPlayingChange: (playing: boolean) => void;
  onEnded: () => void;
  onClose: () => void;
}

export function YouTubePanel({ session, ducked, controlsRef, onSelect, onPlayingChange, onEnded, onClose }: YouTubePanelProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const volumeRef = useRef(DEFAULT_VOLUME);
  const duckedRef = useRef(ducked);
  const callbacksRef = useRef({ onPlayingChange, onEnded });
  callbacksRef.current = { onPlayingChange, onEnded };
  const { current, results } = session;

  useImperativeHandle(controlsRef, () => ({
    pause: () => playerRef.current?.pauseVideo(),
    resume: () => playerRef.current?.playVideo(),
    changeVolume: (delta) => {
      volumeRef.current = Math.max(0, Math.min(100, volumeRef.current + delta));
      if (!duckedRef.current) playerRef.current?.setVolume(volumeRef.current);
      return volumeRef.current;
    },
    mute: () => playerRef.current?.mute(),
    unmute: () => playerRef.current?.unMute(),
  }));

  // Create the player once. YouTube replaces the element it is given, so use a child React doesn't manage.
  const hasVideo = Boolean(current);
  useEffect(() => {
    if (!hasVideo || !hostRef.current) return;
    const host = hostRef.current;
    let cancelled = false;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !current) return;
        const element = document.createElement('div');
        host.appendChild(element);
        playerRef.current = new YT.Player(element, {
          videoId: current.videoId,
          width: '100%',
          height: '100%',
          playerVars: { autoplay: session.autoplay ? 1 : 0, rel: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onReady: ({ target }) => {
              readyRef.current = true;
              target.setVolume(duckedRef.current ? DUCKED_VOLUME : volumeRef.current);
              if (session.autoplay) target.playVideo();
            },
            onStateChange: ({ data }) => {
              if (data === YT.PlayerState.PLAYING) callbacksRef.current.onPlayingChange(true);
              if (data === YT.PlayerState.PAUSED) callbacksRef.current.onPlayingChange(false);
              if (data === YT.PlayerState.ENDED) callbacksRef.current.onEnded();
            },
          },
        });
      })
      .catch(() => callbacksRef.current.onPlayingChange(false));

    return () => {
      cancelled = true;
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
      host.replaceChildren();
    };
    // Created once per panel; later video changes go through loadVideoById below.
  }, [hasVideo]);

  // Switch videos without recreating the player.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current || !current) return;
    if (session.autoplay) player.loadVideoById(current.videoId);
    else player.cueVideoById(current.videoId);
  }, [current?.videoId, session.nonce, session.autoplay]);

  useEffect(() => {
    duckedRef.current = ducked;
    if (readyRef.current) playerRef.current?.setVolume(ducked ? DUCKED_VOLUME : volumeRef.current);
  }, [ducked]);

  return (
    <section className="side-panel panel media" aria-label="YouTube">
      <div className="side-panel__header">
        <span className="side-panel__title">
          YouTube <span className="side-panel__subject">{current?.title ?? results.query}</span>
        </span>
        <button type="button" className="hud-btn hud-btn--icon side-panel__close" onClick={onClose} aria-label="Close player" title="Close player">
          <CloseIcon />
        </button>
      </div>

      {current ? (
        <div className="media__frame" ref={hostRef} />
      ) : (
        <p className="side-panel__empty">A YouTube search is ready for you, Sir.</p>
      )}

      {results.videos.length > 1 && (
        <ol className="media__list">
          {results.videos.map((video) => (
            <li key={video.videoId}>
              <button
                type="button"
                className={`media__item${video.videoId === current?.videoId ? ' is-current' : ''}`}
                onClick={() => onSelect(video)}
              >
                <img src={video.thumbnailUrl} alt="" loading="lazy" />
                <span className="media__item-text">
                  <span className="media__item-title">{video.title}</span>
                  <span className="media__item-channel">{video.channel}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}

      <a className="media__link" href={current?.url ?? results.searchUrl} target="_blank" rel="noopener noreferrer">
        {current ? 'Open on YouTube ↗' : `Search YouTube for “${results.query}” ↗`}
      </a>
    </section>
  );
}
