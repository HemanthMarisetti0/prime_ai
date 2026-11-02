import { ChatInput } from './components/ChatInput';
import { ErrorBanner } from './components/ErrorBanner';
import { Header } from './components/Header';
import { MessageList } from './components/MessageList';
import { useChat } from './hooks/useChat';

export default function App() {
  const chat = useChat();

  return (
    <div className="app">
      <Header
        onNewConversation={chat.newConversation}
        onClearConversation={chat.clearConversation}
        canClear={chat.messages.length > 1 || chat.isLoading}
      />
      <main className="chat">
        <MessageList messages={chat.messages} isLoading={chat.isLoading} />
        {chat.error && <ErrorBanner message={chat.error} onDismiss={chat.dismissError} />}
        <ChatInput key={chat.conversationId} onSend={chat.send} isLoading={chat.isLoading} />
      </main>
    </div>
  );
}
