import { useState, useEffect } from "react";
import { RoomMemberEvent } from "matrix-js-sdk";
import { useMatrix } from "../contexts/MatrixContext";
import { shortName } from "../lib/helpers";

export default function TypingIndicator() {
  const { client, currentRoomId } = useMatrix();
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !currentRoomId) {
      setText(null);
      return;
    }

    const handler = () => {
      const room = client.getRoom(currentRoomId);
      if (!room) return;
      const members = room.currentState.getMembers();
      const typing = members.filter(
        (m) => m.typing && m.userId !== client.getUserId()
      );
      if (typing.length) {
        setText(
          typing.map((m) => shortName(m.userId, client)).join(", ") +
            " typing…"
        );
      } else {
        setText(null);
      }
    };

    client.on(RoomMemberEvent.Typing, handler);
    return () => {
      client.removeListener(RoomMemberEvent.Typing, handler);
    };
  }, [client, currentRoomId]);

  if (!text) return null;

  return (
    <div className="px-4 pb-2 pt-1 text-[0.78rem] italic text-muted">
      {text}
    </div>
  );
}
