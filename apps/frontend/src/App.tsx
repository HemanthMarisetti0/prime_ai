import { useCallback, useEffect, useRef, useState } from 'react';
import type { YouTubeVideo } from '@prime/shared';
import { BootSequence } from './components/BootSequence';
import { ChatInput } from './components/ChatInput';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { DirectionsPanel } from './components/DirectionsPanel';
import { ErrorBanner } from './components/ErrorBanner';
import { Header, type Account } from './components/Header';
import { MessageList } from './components/MessageList';
import { NewsPanel } from './components/NewsPanel';
import { PlacesPanel } from './components/PlacesPanel';
import { QuickActions } from './components/QuickActions';
import { Reactor, type ReactorState } from './components/Reactor';
import { TripPanel } from './components/TripPanel';
import { VoiceSettings } from './components/VoiceSettings';
import { WeatherPanel } from './components/WeatherPanel';
import { VOLUME_STEP, YouTubePanel, type MediaControls, type MediaSession } from './components/YouTubePanel';
import { PcControlError } from './api/pc';
import { parseMediaCommand, type MediaCommand } from './media/commands';
import { parsePcCommand } from './pc/commands';
import { runPcCommand } from './pc/runPcCommand';
import type { AttachedImage } from './media/image';
import { useChat } from './hooks/useChat';
import { useGeolocation } from './hooks/useGeolocation';
import { useHandsFree } from './hooks/useHandsFree';
import { useWakeWord } from './hooks/useWakeWord';
import { playWakeChime } from './media/chime';
import { useServerStatus } from './hooks/useServerStatus';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis';
import { useSystemStats } from './hooks/useSystemStats';

const VOICE_REPLIES_KEY = 'prime.voiceReplies';

// Messages that likely need Sir's location (weather, nearby places, directions).
const LOCATION_HINT =
  /\b(weather|forecast|temperature|rain\w*|umbrella|sunny|cloudy|humid\w*|windy|snow\w*|storm\w*|degrees|near me|nearby|nearest|closest|around here|directions?|route|navigate|how far|how long (does it take|to get|to reach)|get to|take me to|way to)\b/i;

type InfoPanel = 'weather' | 'news' | 'places' | 'directions' | 'trip';

const STATE_LABEL: Record<ReactorState, string> = {
  connecting: 'Initialising',
  offline: 'Offline',
  standby: 'Standing by',
  listening: 'Listening',
  thinking: 'Processing',
  speaking: 'Responding',
};

const WAKE_WORD_KEY = 'prime.wakeWord';
const BOOTED_KEY = 'prime.booted';

/** Play the boot sequence once per browser session, and never for reduced-motion users. */
function shouldShowBoot(): boolean {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    return sessionStorage.getItem(BOOTED_KEY) !== '1';
  } catch {
    return true;
  }
}

function loadFlag(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'on';
  } catch {
    return fallback;
  }
}

function saveFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? 'on' : 'off');
  } catch {
    // Preference simply won't persist.
  }
}

const loadVoiceReplies = () => loadFlag(VOICE_REPLIES_KEY, true);

interface AppProps {
  /** Signed-in user, or null when sign-in is disabled (local development without Firebase). */
  account: Account | null;
  onSignOut: () => void;
}

export default function App({ account, onSignOut }: AppProps) {
  const chat = useChat();
  const serverStatus = useServerStatus(chat.error);
  const speech = useSpeechSynthesis();
  const [voiceReplies, setVoiceReplies] = useState(loadVoiceReplies);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const lastHandledReplyRef = useRef<string | null>(null);

  // Speak each new reply (an assistant message that answers a user message, not the greeting).
  useEffect(() => {
    const last = chat.messages.at(-1);
    const previous = chat.messages.at(-2);
    if (!last || last.role !== 'assistant' || previous?.role !== 'user') return;
    if (lastHandledReplyRef.current === last.id) return;
    lastHandledReplyRef.current = last.id;
    if (voiceReplies) speech.speak(last.content);
  }, [chat.messages, voiceReplies, speech.speak]);

  const toggleVoiceReplies = () => {
    const next = !voiceReplies;
    setVoiceReplies(next);
    if (!next) speech.stop();
    saveFlag(VOICE_REPLIES_KEY, next);
  };

  const { send, clearConversation, newConversation, dismissError, addLocalExchange } = chat;
  const { stop: stopSpeaking } = speech;

  const { getLocation, knownLocation } = useGeolocation();

  // YouTube player session: started by replies that searched YouTube, kept across the conversation.
  const [mediaSession, setMediaSession] = useState<MediaSession | null>(null);
  const [mediaPlaying, setMediaPlaying] = useState(false);
  const mediaControlsRef = useRef<MediaControls | null>(null);
  const lastMediaReplyRef = useRef<string | null>(null);

  useEffect(() => {
    const reply = chat.messages.at(-1);
    if (!reply?.youtube || lastMediaReplyRef.current === reply.id) return;
    lastMediaReplyRef.current = reply.id;
    const { youtube } = reply;
    setMediaSession((prev) => ({
      results: youtube,
      // Suggestions alone shouldn't interrupt something that's already playing.
      current: youtube.autoplay || !prev?.current || !mediaPlaying ? (youtube.videos[0] ?? null) : prev.current,
      autoplay: youtube.autoplay,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
    if (youtube.autoplay) setMediaPlaying(true);
  }, [chat.messages, mediaPlaying]);

  const playVideo = useCallback((video: YouTubeVideo) => {
    setMediaSession((prev) => prev && { ...prev, current: video, autoplay: true, nonce: prev.nonce + 1 });
  }, []);

  const closeMedia = useCallback(() => {
    setMediaSession(null);
    setMediaPlaying(false);
  }, []);

  const nextVideo = (session: MediaSession): YouTubeVideo | undefined => {
    const { videos } = session.results;
    const index = videos.findIndex((v) => v.videoId === session.current?.videoId);
    return videos[index + 1];
  };

  /** Executes a playback command locally and returns P.R.I.M.E.'s acknowledgement. */
  const runMediaCommand = (command: MediaCommand, session: MediaSession): string => {
    const controls = mediaControlsRef.current;
    switch (command) {
      case 'pause':
        controls?.pause();
        return 'Paused, Sir.';
      case 'resume':
        controls?.resume();
        return 'Resuming, Sir.';
      case 'stop':
        closeMedia();
        return 'Playback stopped, Sir.';
      case 'next': {
        const next = nextVideo(session);
        if (!next) return 'That was the last suggestion, Sir. Shall I find something else?';
        playVideo(next);
        return `Now playing ${next.title}, Sir.`;
      }
      case 'volumeUp':
        return `Volume raised to ${controls?.changeVolume(VOLUME_STEP) ?? 0} percent, Sir.`;
      case 'volumeDown':
        return `Volume lowered to ${controls?.changeVolume(-VOLUME_STEP) ?? 0} percent, Sir.`;
      case 'mute':
        controls?.mute();
        return 'Muted, Sir.';
      case 'unmute':
        controls?.unmute();
        return 'Sound restored, Sir.';
    }
  };

  const handleSend = useCallback(
    async (text: string, image?: AttachedImage) => {
      stopSpeaking();
      setVoiceError(null);

      if (!image) {
        // Playback commands are handled instantly in the browser, without the AI.
        const command = mediaSession?.current ? parseMediaCommand(text) : null;
        if (command && mediaSession) {
          addLocalExchange(text, runMediaCommand(command, mediaSession));
          return true;
        }

        // Explicit PC commands go straight to the backend; if PC control is off, the AI explains.
        const pcCommand = parsePcCommand(text);
        if (pcCommand) {
          try {
            addLocalExchange(text, await runPcCommand(pcCommand));
            return true;
          } catch (error) {
            if (!(error instanceof PcControlError) || !error.unavailable) {
              addLocalExchange(text, error instanceof Error ? error.message : 'My apologies, Sir. That did not work.');
              return true;
            }
          }
        }
      }

      // Ask for location only once weather comes up; afterwards it is reused for the session.
      const location = knownLocation() ?? (LOCATION_HINT.test(text) ? await getLocation() : null);
      const media = mediaSession?.current ? { title: mediaSession.current.title, playing: mediaPlaying } : null;
      return send(text, { location, media, image });
    },
    // runMediaCommand only touches stable refs/setters plus mediaSession, which is listed.
    [send, stopSpeaking, getLocation, knownLocation, mediaSession, mediaPlaying, addLocalExchange],
  );

  const handleClear = () => {
    stopSpeaking();
    setVoiceError(null);
    clearConversation();
  };

  const handleNew = () => {
    stopSpeaking();
    setVoiceError(null);
    newConversation();
  };

  const [handsFree, setHandsFree] = useState(false);
  const [wakeEnabled, setWakeEnabled] = useState(() => loadFlag(WAKE_WORD_KEY, false));
  const [dictating, setDictating] = useState(false);

  const handsFreeSession = useHandsFree({
    enabled: handsFree,
    isLoading: chat.isLoading,
    isSpeaking: speech.isSpeaking,
    send: handleSend,
    onDisable: () => setHandsFree(false),
    onError: setVoiceError,
    // With the wake word armed, an idle voice link returns to waiting for "Hey Prime".
    endAfterSilentRounds: wakeEnabled ? 2 : undefined,
  });

  const wakeStatus = useWakeWord({
    enabled: wakeEnabled,
    paused: handsFree || chat.isLoading || speech.isSpeaking || dictating,
    onWake: (request) => {
      playWakeChime();
      setVoiceError(null);
      setHandsFree(true);
      if (request.length > 1) void handleSend(request);
    },
  });

  const toggleWakeWord = () => {
    const next = !wakeEnabled;
    setWakeEnabled(next);
    saveFlag(WAKE_WORD_KEY, next);
  };

  const reactorState: ReactorState =
    serverStatus === 'offline'
      ? 'offline'
      : handsFreeSession.phase === 'listening'
        ? 'listening'
        : chat.isLoading
          ? 'thinking'
          : speech.isSpeaking
            ? 'speaking'
            : serverStatus === 'checking'
              ? 'connecting'
              : 'standby';

  // Tapping the core silences a reply outside voice mode; otherwise it toggles the voice link.
  const activateCore = () => {
    if (!handsFree && speech.isSpeaking) {
      stopSpeaking();
      return;
    }
    setVoiceError(null);
    setHandsFree((on) => !on);
  };

  const coreHint = (() => {
    if (reactorState === 'offline') return 'My apologies, Sir. I cannot reach my server.';
    if (!handsFreeSession.isSupported) return 'The voice link requires Chrome or Edge, Sir.';
    if (reactorState === 'listening')
      return handsFreeSession.transcript || 'I am listening, Sir. Say “stop listening” whenever you wish.';
    if (reactorState === 'thinking') return 'One moment, Sir…';
    if (reactorState === 'speaking')
      return handsFree ? 'Tap the core whenever you wish to end the voice link.' : 'Tap the core should you wish me to stop.';
    if (handsFree) return 'Voice link engaged. I am at your service, Sir.';
    if (wakeStatus === 'blocked') return 'Microphone access is blocked, Sir, so I cannot listen for my name.';
    return wakeStatus === 'armed'
      ? 'Say “Hey Prime”, or tap the core, Sir.'
      : 'At your service, Sir. Tap the core to speak.';
  })();

  // Diagnostics follow the latest reply: shown when it concerned the system, hidden once the
  // conversation moves on. A manual toggle applies only until the next reply arrives.
  const latestReply = chat.messages.findLast((m) => m.role === 'assistant');
  const [diagnosticsOverride, setDiagnosticsOverride] = useState<{ replyId?: string; open: boolean } | null>(null);
  const showDiagnostics =
    diagnosticsOverride && diagnosticsOverride.replyId === latestReply?.id
      ? diagnosticsOverride.open
      : latestReply?.display === 'system';
  const toggleDiagnostics = () => setDiagnosticsOverride({ replyId: latestReply?.id, open: !showDiagnostics });

  // Info panels show with the reply that fetched them, until closed or superseded.
  const [closedPanels, setClosedPanels] = useState<{ replyId?: string; panels: InfoPanel[] }>({ panels: [] });
  const isClosed = (panel: InfoPanel) =>
    closedPanels.replyId === latestReply?.id && closedPanels.panels.includes(panel);
  const closePanel = (panel: InfoPanel) =>
    setClosedPanels((prev) => ({
      replyId: latestReply?.id,
      panels: prev.replyId === latestReply?.id ? [...prev.panels, panel] : [panel],
    }));
  const weatherReport = isClosed('weather') ? undefined : latestReply?.weather;
  const newsReport = isClosed('news') ? undefined : latestReply?.news;
  const placesResult = isClosed('places') ? undefined : latestReply?.places;
  const directionsResult = isClosed('directions') ? undefined : latestReply?.directions;
  const tripPlan = isClosed('trip') ? undefined : latestReply?.trip;
  const hasSidePanel =
    showDiagnostics ||
    Boolean(mediaSession || weatherReport || newsReport || placesResult || directionsResult || tripPlan);

  // Lower the music while P.R.I.M.E. speaks or listens.
  const mediaDucked = speech.isSpeaking || handsFreeSession.phase === 'listening';

  const coreActionLabel = handsFree
    ? 'End voice link'
    : speech.isSpeaking
      ? 'Stop speaking'
      : 'Start voice link';

  const systemStats = useSystemStats(showDiagnostics);

  const errorMessage = chat.error ?? voiceError;
  const handleDismissError = () => {
    dismissError();
    setVoiceError(null);
  };

  const exchangeCount = chat.messages.length;

  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const [booting, setBooting] = useState(shouldShowBoot);
  const finishBoot = useCallback(() => {
    setBooting(false);
    try {
      sessionStorage.setItem(BOOTED_KEY, '1');
    } catch {
      // Boot will simply replay next load.
    }
  }, []);

  return (
    <div className="hud">
      {booting && (
        <BootSequence
          serverStatus={serverStatus}
          accountName={account?.name ?? null}
          recognitionSupported={handsFreeSession.isSupported}
          synthesisSupported={speech.isSupported}
          wakeStatus={wakeStatus}
          onDone={finishBoot}
        />
      )}
      <Header
        serverStatus={serverStatus}
        voiceReplies={voiceReplies}
        voiceSupported={speech.isSupported}
        onToggleVoiceReplies={toggleVoiceReplies}
        voiceSettings={
          <VoiceSettings
            voices={speech.voices}
            voice={speech.voice}
            onVoiceChange={speech.setVoice}
            rate={speech.rate}
            onRateChange={speech.setRate}
            onTest={speech.speak}
            disabled={!speech.isSupported}
            open={voiceSettingsOpen}
            onOpenChange={setVoiceSettingsOpen}
          />
        }
        onNewConversation={handleNew}
        onClearConversation={handleClear}
        canClear={chat.messages.length > 1 || chat.isLoading}
        diagnosticsOpen={showDiagnostics}
        onToggleDiagnostics={toggleDiagnostics}
        wakeStatus={wakeStatus}
        onToggleWakeWord={toggleWakeWord}
        onOpenVoiceSettings={() => setVoiceSettingsOpen(true)}
        account={account}
        onSignOut={() => {
          stopSpeaking();
          setHandsFree(false);
          onSignOut();
        }}
      />

      <main className="hud__body">
        <div className={`hud__left${hasSidePanel ? ' hud__left--panels' : ''}`}>
          {mediaSession && (
            <YouTubePanel
              session={mediaSession}
              ducked={mediaDucked}
              controlsRef={mediaControlsRef}
              onSelect={playVideo}
              onPlayingChange={setMediaPlaying}
              onEnded={() => {
                const next = nextVideo(mediaSession);
                if (next) playVideo(next);
                else setMediaPlaying(false);
              }}
              onClose={closeMedia}
            />
          )}
          <section className={`core-panel panel core-panel--${reactorState}`} aria-label="Assistant core">
            <div className="core-panel__scan" aria-hidden="true" />
            <Reactor
              state={reactorState}
              active={handsFree}
              disabled={!handsFreeSession.isSupported && !speech.isSpeaking}
              label={coreActionLabel}
              onActivate={activateCore}
            />
            <div className="core-panel__readout">
              <p className="core-panel__state">{STATE_LABEL[reactorState]}</p>
              <p className="core-panel__hint" aria-live="polite">
                {coreHint}
              </p>
              <p className={`core-panel__link${handsFree ? ' is-on' : ''}`}>
                Voice link · {handsFree ? 'Engaged' : 'Standby'}
              </p>
            </div>
          </section>
          {showDiagnostics && (
            <DiagnosticsPanel
              snapshot={systemStats}
              canRun={!chat.isLoading}
              onRunDiagnostics={() => void handleSend('Run a full system diagnostic, please.')}
              onClose={toggleDiagnostics}
            />
          )}
          {weatherReport && <WeatherPanel report={weatherReport} onClose={() => closePanel('weather')} />}
          {newsReport && <NewsPanel report={newsReport} onClose={() => closePanel('news')} />}
          {directionsResult && <DirectionsPanel result={directionsResult} onClose={() => closePanel('directions')} />}
          {placesResult && <PlacesPanel result={placesResult} onClose={() => closePanel('places')} />}
          {tripPlan && <TripPanel plan={tripPlan} onClose={() => closePanel('trip')} />}
        </div>

        <section className="comms panel" aria-label="Conversation">
          <div className="comms__header">
            <span>Comms log</span>
            <span className="comms__count">{String(exchangeCount).padStart(2, '0')} entries</span>
          </div>
          <MessageList messages={chat.messages} isLoading={chat.isLoading} />
          {chat.messages.length === 1 && !chat.isLoading && (
            <QuickActions onSelect={(prompt) => void handleSend(prompt)} disabled={serverStatus === 'offline'} />
          )}
          {errorMessage && <ErrorBanner message={errorMessage} onDismiss={handleDismissError} />}
          <ChatInput
            key={chat.conversationId}
            onSend={handleSend}
            isLoading={chat.isLoading}
            isSpeaking={speech.isSpeaking}
            onStopSpeaking={stopSpeaking}
            onVoiceError={setVoiceError}
            micDisabled={handsFree}
            onDictatingChange={setDictating}
          />
        </section>
      </main>
    </div>
  );
}
