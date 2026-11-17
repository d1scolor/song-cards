import { z } from "zod";
import { getDatabase } from "@/lib/db";

const endpoint = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (
        ["https:", "http:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }, "Use a full HTTP or HTTPS endpoint without credentials or query parameters.");

export const voiceSettingsSchema = z
  .object({
    enabled: z.boolean(),
    onlineEnabled: z.boolean(),
    asrUrl: endpoint,
    asrModel: z.string().trim().max(200),
    llmUrl: endpoint,
    llmModel: z.string().trim().max(200),
    preferredChannels: z
      .array(
        z
          .string()
          .trim()
          .regex(/^UC[\w-]{22}$/)
      )
      .max(3),
    language: z.string().trim().max(80),
    maxSongSeconds: z.number().int().min(30).max(1800),
    asrApiKey: z.string().max(2000).optional(),
    llmApiKey: z.string().max(2000).optional()
  })
  .strict()
  .superRefine((settings, context) => {
    if (
      settings.enabled &&
      (!settings.asrUrl ||
        !settings.asrModel ||
        !settings.llmUrl ||
        !settings.llmModel)
    ) {
      context.addIssue({
        code: "custom",
        message: "Configure both services before enabling voice requests."
      });
    }
  });

export type VoiceSettings = z.infer<typeof voiceSettingsSchema> & {
  asrApiKey: string;
  llmApiKey: string;
};
export type PublicVoiceSettings = Omit<
  VoiceSettings,
  "asrApiKey" | "llmApiKey"
> & {
  asrKeyConfigured: boolean;
  llmKeyConfigured: boolean;
};

const defaults: VoiceSettings = {
  enabled: false,
  onlineEnabled: false,
  asrUrl: "",
  asrModel: "",
  asrApiKey: "",
  llmUrl: "",
  llmModel: "",
  llmApiKey: "",
  preferredChannels: [],
  language: "English",
  maxSongSeconds: 600
};

export function getVoiceSettings(): VoiceSettings {
  const row = getDatabase()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get("voice.settings") as { value: string } | undefined;
  if (!row) return { ...defaults };
  try {
    return { ...defaults, ...voiceSettingsSchema.parse(JSON.parse(row.value)) };
  } catch {
    return { ...defaults };
  }
}

export function publicVoiceSettings(
  settings = getVoiceSettings()
): PublicVoiceSettings {
  const { asrApiKey, llmApiKey, ...publicSettings } = settings;
  return {
    ...publicSettings,
    asrKeyConfigured: Boolean(asrApiKey),
    llmKeyConfigured: Boolean(llmApiKey)
  };
}

export function saveVoiceSettings(input: z.input<typeof voiceSettingsSchema>) {
  const parsed = voiceSettingsSchema.parse(input);
  const current = getVoiceSettings();
  const next = {
    ...current,
    ...Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => value !== undefined)
    )
  };
  getDatabase()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run("voice.settings", JSON.stringify(next));
  return publicVoiceSettings(next);
}
