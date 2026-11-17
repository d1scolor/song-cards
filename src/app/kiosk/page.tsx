import type { Metadata } from "next";
import { LocalPlaybackProvider } from "@/components/local-playback";
import { Scanner } from "@/components/scanner";
import { isAdminPage } from "@/lib/auth";
import { getPlaybackSettings } from "@/lib/repository";
import { getVoiceSettings } from "@/lib/voice-settings";

export const metadata: Metadata = {
  title: "Kiosk"
};

export default async function KioskPage() {
  const settings = getPlaybackSettings();
  return (
    <LocalPlaybackProvider>
      <Scanner
        showAdminExit={await isAdminPage()}
        initialPlaybackTarget={settings.kioskPlaybackTarget}
        voiceEnabled={getVoiceSettings().enabled}
      />
    </LocalPlaybackProvider>
  );
}
