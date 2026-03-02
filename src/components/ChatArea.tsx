import { useMatrix } from "../contexts/MatrixContext";
import ChatHeader from "./ChatHeader";
import CryptoBanner from "./CryptoBanner";
import Timeline from "./Timeline";
import TypingIndicator from "./TypingIndicator";
import MessageComposer from "./MessageComposer";

interface ChatAreaProps {
  onOpenSidebar: () => void;
}

export default function ChatArea({ onOpenSidebar }: ChatAreaProps) {
  const { currentRoomId } = useMatrix();

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <ChatHeader onOpenSidebar={onOpenSidebar} />
      <CryptoBanner />
      <Timeline />
      <TypingIndicator />
      {currentRoomId && <MessageComposer />}
    </main>
  );
}
