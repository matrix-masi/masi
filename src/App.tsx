import { useMatrix } from "./contexts/MatrixContext";
import { useSwarm } from "./contexts/SwarmContext";
import LoginScreen from "./components/LoginScreen";
import UnlockConfigScreen from "./components/UnlockConfigScreen";
import AppScreen from "./components/AppScreen";
import RecoveryModal from "./components/RecoveryModal";
import Lightbox from "./components/Lightbox";
import PlaylistViewer from "./components/PlaylistViewer";

export default function App() {
  const { client } = useMatrix();
  const { hasAnyAccounts, configNeedsUnlock } = useSwarm();

  if (configNeedsUnlock) {
    return <UnlockConfigScreen />;
  }

  if (!client && !hasAnyAccounts) {
    return <LoginScreen />;
  }

  return (
    <>
      <AppScreen />
      <RecoveryModal />
      <Lightbox />
      <PlaylistViewer />
    </>
  );
}
