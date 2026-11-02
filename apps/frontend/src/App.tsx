import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatInput } from './components/ChatInput';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { ErrorBanner } from './components/ErrorBanner';
import { Header, type Account } from './components/Header';
import { MessageList } from './components/MessageList';
import { NewsPanel } from './components/NewsPanel';
import { Reactor, type ReactorState } from './components/Reactor';
import { VoiceSettings } from './components/VoiceSettings';
import { WeatherPanel } from './components/WeatherPanel';
import { useChat } from './hooks/useChat';
import { useGeolocation } from './hooks/useGeolocation';
import { useHandsFree } from './hooks/useHandsFree';
import { useServerStatus } from './hooks/useServerStatus';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis';
import { useSystemStats } from './hooks/useSystemStats';

const VOICE_REPLIES_KEY = 'prime.voiceReplies';

const WEATHER_HINT =
  /\b(weather|forecast|temperature|rain\w*|umbrella|sunny|cloudy|humid\w*|windy|snow\w*|storm\w*|degrees)\b/i;

const STATE_LABEL: Record<ReactorState, string> = {
  connecting: 'Initialising',
  offline: 'Offline',
  standby: 'Standing by',
  listening: 'Listening',
  thinking: 'Processing',
  speaking: 'Responding',
};

function loadVoiceReplies(): boolean {
  try {
    return localStorage.getItem(VOICE_REPLIES_KEY) !== 'off';
  } catch {
    return true;
  }
}

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
    try {
      localStorage.setItem(VOICE_REPLIES_KEY, next ? 'on' : 'off');
    } catch {
      // Preference simply won't persist.
    }
  };

  const { send, clearConversation, newConversation, dismissError } = chat;
  const { stop: stopSpeaking } = speech;

  const { getLocation, knownLocation } = useGeolocation();

  const handleSend = useCallback(
    async (text: string) => {
      stopSpeaking();
      setVoiceError(null);
      // Ask for location only once weather comes up; afterwards it is reused for the session.
      const location = knownLocation() ?? (WEATHER_HINT.test(text) ? await getLocation() : null);
      return send(text, location);
    },
    [send, stopSpeaking, getLocation, knownLocation],
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
  const handsFreeSession = useHandsFree({
    enabled: handsFree,
    isLoading: chat.isLoading,
    isSpeaking: speech.isSpeaking,
    send: handleSend,
    onDisable: () => setHandsFree(false),
    onError: setVoiceError,
  });

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
    return handsFree ? 'Voice link engaged. I am at your service, Sir.' : 'At your service, Sir. Tap the core to speak.';
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

  // Weather and news panels show with the reply that fetched them, until closed or superseded.
  const [closedPanels, setClosedPanels] = useState<{ replyId?: string; panels: ('weather' | 'news')[] }>({ panels: [] });
  const isClosed = (panel: 'weather' | 'news') =>
    closedPanels.replyId === latestReply?.id && closedPanels.panels.includes(panel);
  const closePanel = (panel: 'weather' | 'news') =>
    setClosedPanels((prev) => ({
      replyId: latestReply?.id,
      panels: prev.replyId === latestReply?.id ? [...prev.panels, panel] : [panel],
    }));
  const weatherReport = isClosed('weather') ? undefined : latestReply?.weather;
  const newsReport = isClosed('news') ? undefined : latestReply?.news;
  const hasSidePanel = showDiagnostics || Boolean(weatherReport) || Boolean(newsReport);

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

  return (
    <div className="hud">
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
          />
        }
        onNewConversation={handleNew}
        onClearConversation={handleClear}
        canClear={chat.messages.length > 1 || chat.isLoading}
        diagnosticsOpen={showDiagnostics}
        onToggleDiagnostics={toggleDiagnostics}
        account={account}
        onSignOut={() => {
          stopSpeaking();
          setHandsFree(false);
          onSignOut();
        }}
      />

      <main className="hud__body">
        <div className={`hud__left${hasSidePanel ? ' hud__left--panels' : ''}`}>
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
        </div>

        <section className="comms panel" aria-label="Conversation">
          <div className="comms__header">
            <span>Comms log</span>
            <span className="comms__count">{String(exchangeCount).padStart(2, '0')} entries</span>
          </div>
          <MessageList messages={chat.messages} isLoading={chat.isLoading} />
          {errorMessage && <ErrorBanner message={errorMessage} onDismiss={handleDismissError} />}
          <ChatInput
            key={chat.conversationId}
            onSend={handleSend}
            isLoading={chat.isLoading}
            isSpeaking={speech.isSpeaking}
            onStopSpeaking={stopSpeaking}
            onVoiceError={setVoiceError}
            micDisabled={handsFree}
          />
        </section>
      </main>
    </div>
  );
}
