import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { createInitialSession, reduceClickySession, type ClickySessionEvent, type ClickySession } from "../services/clickySession";
import type { ConversationMessage } from "../services/workerClient";

export function useClickySession(): {
  session: ClickySession;
  dispatch: (event: ClickySessionEvent) => void;
  conversationMessagesRef: MutableRefObject<ConversationMessage[]>;
  sessionStatusRef: MutableRefObject<ClickySession["status"]>;
  setConversationMessages: Dispatch<SetStateAction<ConversationMessage[]>>;
} {
  const [session, setSession] = useState(createInitialSession);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const sessionStatusRef = useRef(session.status);
  const conversationMessagesRef = useRef<ConversationMessage[]>([]);

  const dispatch = useCallback((event: ClickySessionEvent) => {
    setSession((current) => reduceClickySession(current, event));
  }, []);

  useEffect(() => {
    sessionStatusRef.current = session.status;
  }, [session.status, sessionStatusRef]);

  useEffect(() => {
    conversationMessagesRef.current = conversationMessages;
  }, [conversationMessages, conversationMessagesRef]);

  return {
    session,
    dispatch,
    conversationMessagesRef,
    sessionStatusRef,
    setConversationMessages
  };
}
