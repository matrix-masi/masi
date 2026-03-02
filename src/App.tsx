import { useEffect } from "react";
import { useMatrix } from "./contexts/MatrixContext";
import LoginScreen from "./components/LoginScreen";
import AppScreen from "./components/AppScreen";
import RecoveryModal from "./components/RecoveryModal";
import Lightbox from "./components/Lightbox";

export default function App() {
  const { client, session, initFromSession } = useMatrix();

  useEffect(() => {
    if (session && !client) {
      initFromSession(session);
    }
  }, [session, client, initFromSession]);

  if (!client) {
    return <LoginScreen />;
  }

  return (
    <>
      <AppScreen />
      <RecoveryModal />
      <Lightbox />
    </>
  );
}
