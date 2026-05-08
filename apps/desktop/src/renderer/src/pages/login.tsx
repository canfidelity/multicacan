import { LoginPage } from "@multicacan/views/auth";
import { DragStrip } from "@multicacan/views/platform";
import { MulticacanIcon } from "@multicacan/ui/components/common/multicacan-icon";

const WEB_URL = import.meta.env.VITE_APP_URL || "http://localhost:3000";

export function DesktopLoginPage() {
  const handleGoogleLogin = () => {
    // Open web login page in the default browser with platform=desktop flag.
    // The web callback will redirect back via multicacan:// deep link with the token.
    window.desktopAPI.openExternal(
      `${WEB_URL}/login?platform=desktop`,
    );
  };

  return (
    <div className="flex h-screen flex-col">
      <DragStrip />
      <LoginPage
        logo={<MulticacanIcon bordered size="lg" />}
        onSuccess={() => {
          // Auth store update triggers AppContent re-render → shows DesktopShell.
          // Initial workspace navigation happens in routes.tsx via IndexRedirect.
        }}
        onGoogleLogin={handleGoogleLogin}
      />
    </div>
  );
}
