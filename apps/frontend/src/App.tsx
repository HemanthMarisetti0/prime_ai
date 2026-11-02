import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatInput } from './components/ChatInput';
import { ErrorBanner } from './components/ErrorBanner';
import { Header } from './components/Header';
import { MessageList } from './components/MessageList';
import { HandsFreeBar } from './components/HandsFreeBar';
import { useChat } from './hooks/useChat';
import { useHandsFree } from './hooks/useHandsFree';
import { useServerStatus } from './hooks/useServerStatus';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis';

const VOICE_REPLIES_KEY = 'prime.voiceReplies';

function loadVoiceReplies(): boolean {
  try {
    return localStorage.getItem(VOICE_REPLIES_KEY) !== 'off';
  } catch {
    return true;
  }
}

export default function App() {
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

  const handleSend = useCallback(
    (text: string) => {
      stopSpeaking();
      setVoiceError(null);
      return send(text);
    },
    [send, stopSpeaking],
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

  const toggleHandsFree = () => {
    setVoiceError(null);
    setHandsFree((on) => !on);
  };

  const errorMessage = chat.error ?? voiceError;
  const handleDismissError = () => {
    dismissError();
    setVoiceError(null);
  };

  return (
    <div className="app">
      <Header
        coreState={chat.isLoading ? 'processing' : serverStatus}
        voiceReplies={voiceReplies}
        voiceSupported={speech.isSupported}
        onToggleVoiceReplies={toggleVoiceReplies}
        handsFree={handsFree}
        handsFreeSupported={handsFreeSession.isSupported}
        onToggleHandsFree={toggleHandsFree}
        onNewConversation={handleNew}
        onClearConversation={handleClear}
        canClear={chat.messages.length > 1 || chat.isLoading}
      />
      <main className="chat">
        <MessageList messages={chat.messages} isLoading={chat.isLoading} />
        {errorMessage && <ErrorBanner message={errorMessage} onDismiss={handleDismissError} />}
        {handsFreeSession.phase !== 'off' && (
          <HandsFreeBar
            phase={handsFreeSession.phase}
            transcript={handsFreeSession.transcript}
            onEnd={() => setHandsFree(false)}
          />
        )}
        <ChatInput
          key={chat.conversationId}
          onSend={handleSend}
          isLoading={chat.isLoading}
          isSpeaking={speech.isSpeaking}
          onStopSpeaking={stopSpeaking}
          onVoiceError={setVoiceError}
          micDisabled={handsFree}
        />
      </main>
    </div>
  );
}
